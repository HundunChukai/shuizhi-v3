"use client";

// C3：全局数据上下文。集中提供 数据源(demo/live)、演示场景、自动演示运行态、全局汇总(/api/summary)、
// 未关闭预警角标，以及 demo 模式下的预警状态本地覆盖（localStorage）。
// 自动演示 = 全局数据运行态（非导航轮播）：运行中全站轮询刷新 + 场景周期循环 + 后端业务闭环心跳，
// 导航完全由用户手动控制；停止后所有轮询归零、数据恢复静态。
// 降级：live 模式轮询 /api/summary；后端不可达或 demo 模式时，summary 回退到「本地内置数据」
// 计算（POOLS + resolveReadings + alerts），保证无后端时角标/统计与 A 阶段完全一致。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePersistentState } from "@/app/components/usePersistentState";
import { useApiData, type DataKind } from "@/app/components/useApiData";
import { apiSend, invalidateCache, setForceRevalidate } from "@/app/lib/apiClient";
import { alerts } from "@/app/data/alerts";
import { POOLS, resolveReadings, type ScenarioMode } from "@/app/data/pools";
import { METRIC_ORDER, summarizeReadings, type MetricStatus } from "@/app/data/metrics";

export type DataSourceMode = "demo" | "live";

// 自动演示运行中全站轮询间隔（live 模式仍用 15s 实时链路）。
export const DEMO_REFRESH_MS = 5_000;
// 自动演示运行中场景循环间隔：正常运行→轻度预警→异常事件→异常恢复。
const DEMO_SCENARIO_CYCLE_MS = 12_000;
const SCENARIO_CYCLE: ScenarioMode[] = ["normal", "warning", "abnormal", "recovery"];

// 与后端 /api/summary（server summaryService.Summary）字段一一对应。
export interface Summary {
  statusCounts: Record<MetricStatus, number>;
  poolsByStatus: Record<MetricStatus, number>;
  openAlertCount: number;
  lastUpdatedAt: number;
  poolCount: number;
  metricReadingCount: number;
}

export interface DataContextValue {
  dataSource: DataSourceMode;
  setDataSource: (mode: DataSourceMode) => void;
  scenario: ScenarioMode;
  setScenario: (scenario: ScenarioMode) => void;
  // 自动演示运行态：true = 全站数据持续动态刷新（导航仍由用户手动控制）。
  demoRunning: boolean;
  toggleDemoRunning: () => void;
  // 显式设置：true = 打开全站数据运行态，false = 关闭并恢复用户原数据源（自动演示导览使用）。
  setDemoRunning: (running: boolean) => void;
  summary: Summary;
  summarySource: DataKind;
  // 全局未关闭预警数（导航角标默认值；页面可用 props 覆盖）。
  openAlertCount: number;
  alertTone: "warning" | "abnormal";
  lastUpdatedAt: number | null;
  // demo 模式下预警状态的本地覆盖（C7 写操作继续走 localStorage，与 A 阶段一致）。
  alertStatuses: Record<string, string>;
  setAlertStatus: (id: string, status: string) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

const emptyCounts = (): Record<MetricStatus, number> => ({ 正常: 0, 预警: 0, 异常: 0 });

const countOpenAlerts = (alertStatuses: Record<string, string>): number =>
  alerts.filter((alert) => (alertStatuses[alert.id] ?? alert.status) !== "已关闭").length;

// 无后端时的汇总：读数状态由 4 池「当前场景」实时统计，池状态直接取 POOLS，角标取未关闭预警数。
// 场景感知：演示/自动演示切换场景时，汇总与导航角标随之联动变化。
function computeFallbackSummary(alertStatuses: Record<string, string>, scenario: ScenarioMode): Summary {
  const allReadings = POOLS.flatMap((pool) => resolveReadings(pool.id, scenario));
  const reading = summarizeReadings(allReadings);
  const poolsByStatus = emptyCounts();
  for (const pool of POOLS) {
    const status = pool.status as MetricStatus;
    if (status in poolsByStatus) poolsByStatus[status] += 1;
  }
  return {
    statusCounts: {
      正常: reading.normalCount,
      预警: reading.warningCount,
      异常: reading.abnormalCount,
    },
    poolsByStatus,
    openAlertCount: countOpenAlerts(alertStatuses),
    lastUpdatedAt: Date.now(),
    poolCount: POOLS.length,
    metricReadingCount: POOLS.length * METRIC_ORDER.length,
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [dataSource, setDataSource] = usePersistentState<DataSourceMode>("aqua-data-source", "demo");
  // 复用驾驶舱既有场景键，使 Context 与页面共享同一份场景状态（C6 统一切换）。
  const [scenario, setScenario] = usePersistentState<ScenarioMode>("jack-dashboard-scenario", "normal");
  // 仅存「用户本地覆盖」的预警状态（默认空对象）。生效状态由使用方按 `覆盖 ?? 数据源自带状态`
  // 计算：无后端时回退内置演示状态、接后端时以 DB 状态为准（C7：demo 写此处，live 走 PATCH）。
  const [alertStatuses, setAlertStatuses] = usePersistentState<Record<string, string>>(
    "jack-alert-statuses",
    {},
  );
  // 自动演示运行态：会话级状态（不持久化——刷新页面后默认静态，需重新点击开始）。
  const [demoRunning, setDemoRunningState] = useState(false);
  // 自动演示统一走「演示数据源」驱动全站动态（场景循环/业务闭环均属演示剧场）；
  // 开始时记住用户当前数据源，停止后原样恢复——实时模式用户演示结束后回到实时刷新。
  const prevSourceRef = useRef<DataSourceMode>("demo");
  const dataSourceRef = useRef(dataSource);
  dataSourceRef.current = dataSource;

  // 显式开关：自动演示导览需要「确保打开 / 确保关闭」，不能依赖 toggle 的取反语义
  // （导览开始与结束不在同一次事件里，toggle 会因状态滞后而反转）。
  const setDemoRunning = useCallback(
    (next: boolean) => {
      if (next) {
        prevSourceRef.current = dataSourceRef.current;
        setDataSource("demo");
        setDemoRunningState(true);
      } else {
        setDemoRunningState(false);
        setDataSource(prevSourceRef.current);
      }
    },
    [setDataSource],
  );

  const toggleDemoRunning = useCallback(() => {
    setDemoRunning(!demoRunning);
  }, [demoRunning, setDemoRunning]);

  // 演示运行中跳过 apiClient 的 15s TTL 缓存：否则 5s 轮询多数命中缓存，
  // 仪表盘 / 趋势图 / 角标在十几秒内看起来是静止的。停止后立即复位，正常浏览行为不变。
  useEffect(() => {
    setForceRevalidate(demoRunning);
    return () => setForceRevalidate(false);
  }, [demoRunning]);

  const fallbackSummary = useMemo(() => computeFallbackSummary(alertStatuses, scenario), [alertStatuses, scenario]);
  const live = dataSource === "live";
  const {
    data: summary,
    source: summarySource,
    updatedAt,
  } = useApiData<Summary>("/summary", fallbackSummary, {
    // 自动演示运行中 demo 模式也轮询后端汇总（预警角标/统计随模拟器增减）；停止后回退本地静态值。
    enabled: live || demoRunning,
    refreshInterval: live ? 15_000 : demoRunning ? DEMO_REFRESH_MS : 0,
  });

  // 自动演示运行中：周期循环切换场景，驱动读数/仪表配色/角标/横幅持续联动变化（只动数据，不动导航）。
  useEffect(() => {
    if (!demoRunning || live) return;
    const timer = window.setInterval(() => {
      setScenario((prev) => SCENARIO_CYCLE[(SCENARIO_CYCLE.indexOf(prev) + 1) % SCENARIO_CYCLE.length]);
    }, DEMO_SCENARIO_CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [demoRunning, live, setScenario]);

  // 场景变化（手动 chip 或演示循环驱动）：demo 模式通知后端模拟器切换场景并失效缓存，
  // 使各页下一次轮询即取到新场景读数；后端不可达则忽略（本地读数已驱动展示）。
  const firstScenarioRun = useRef(true);
  useEffect(() => {
    if (firstScenarioRun.current) {
      firstScenarioRun.current = false;
      return;
    }
    if (live) return;
    invalidateCache("/water-quality");
    invalidateCache("/summary");
    void apiSend("/demo/scenario", "POST", { scenario }).catch(() => {});
  }, [scenario, live]);

  // 运行中周期心跳通知后端启动「投放→监测→收尾」业务闭环（投放记录/投放后监测页随之动态变化）；
  // 停止立即上报 running:false；后端另有 25s 心跳超时兵底，防关页后继续写业务表。
  useEffect(() => {
    if (!demoRunning) {
      void apiSend("/demo/run", "POST", { running: false }).catch(() => {});
      return;
    }
    const beat = (): void => {
      void apiSend("/demo/run", "POST", { running: true }).catch(() => {});
    };
    beat();
    const timer = window.setInterval(beat, 8_000);
    return () => window.clearInterval(timer);
  }, [demoRunning]);

  const setAlertStatus = useCallback(
    (id: string, status: string) => {
      setAlertStatuses((prev) => ({ ...prev, [id]: status }));
    },
    [setAlertStatuses],
  );

  const openAlertCount = summary.openAlertCount;
  const alertTone: "warning" | "abnormal" = (summary.statusCounts?.异常 ?? 0) > 0 ? "abnormal" : "warning";

  const value = useMemo<DataContextValue>(
    () => ({
      dataSource,
      setDataSource,
      scenario,
      setScenario,
      demoRunning,
      toggleDemoRunning,
      setDemoRunning,
      summary,
      summarySource,
      openAlertCount,
      alertTone,
      lastUpdatedAt: updatedAt ?? summary.lastUpdatedAt,
      alertStatuses,
      setAlertStatus,
    }),
    [
      dataSource,
      setDataSource,
      scenario,
      setScenario,
      demoRunning,
      toggleDemoRunning,
      setDemoRunning,
      summary,
      summarySource,
      openAlertCount,
      alertTone,
      updatedAt,
      alertStatuses,
      setAlertStatus,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData() 必须在 <DataProvider> 内使用");
  return ctx;
}
