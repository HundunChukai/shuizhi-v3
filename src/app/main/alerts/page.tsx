"use client";

// 异常预警中心：三级信息架构
//   L0 态势层（可点击摘要卡）—— 我先看什么？
//   L1 事件组层（池 × 指标折叠列表）—— 一共有哪些问题？
//   L2 记录详情层 —— 这一条具体怎么处理？
// 设计目标：在不删减任何字段的前提下，把「N 百条同质流水」压成「少量事件组 + 按需展开的记录」，
// 并让详情始终可达（桌面 sticky 常驻、窄屏抽屉），彻底消除"滚很久才看到详情"的低效路径。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SystemNavigation } from "@/app/components/SystemNavigation";
import { PageHeader } from "@/app/components/PageHeader";
import { AlertsSummaryBar } from "@/app/components/AlertsSummaryBar";
import {
  AlertsGroupList,
  type AlertsFilterState,
} from "@/app/components/AlertsGroupList";
import { AlertsDetailPanel } from "@/app/components/AlertsDetailPanel";
import { usePersistentState } from "@/app/components/usePersistentState";
import { useApiData } from "@/app/components/useApiData";
import { DEMO_REFRESH_MS, useData } from "@/app/components/DataContext";
import { apiGet, apiSend } from "@/app/lib/apiClient";
import {
  alerts as alertsMock,
  groupAlerts,
  groupKeyOf,
  type AlertGroup,
  type AlertRecord,
} from "@/app/data/alerts";
import { METRIC_LIST } from "@/app/data/metrics";
import { POOLS } from "@/app/data/pools";

const STATUS_OPTIONS = ["未处理", "处理中", "观察中", "已关闭"];
// 「待处置」= 未处理 + 处理中：作为进入页面时的默认筛选（见 DEFAULT_FILTERS），
// 避免首屏被占绝大多数的「已关闭」记录占满。
const PENDING_STATUSES = ["未处理", "处理中"];
const GROUPS_WINDOW_STEP = 20;
// 组内发生的单页大小：组内做真实分页（用户点「加载更多」再取下一页），因此没有上限丢失。
// 实测单组最多 400+ 次发生，取 100 兼顾首屏成本与「看全」所需点击次数。
const RECORDS_PAGE_SIZE = 100;
const DEFAULT_FILTERS: AlertsFilterState = {
  status: "待处置",
  poolId: "全部",
  metricId: "全部",
  level: "全部",
  range: "全部",
};

// 状态筛选 → 服务端 status 参数（逗号分隔表示「命中任一」；null = 不限）。
const statusesParam = (filter: string): string[] | null => {
  if (filter === "全部") return null;
  if (filter === "待处置") return PENDING_STATUSES;
  return [filter];
};

// 时间范围 → 起始时刻。用 useMemo 固定在 range 变化时求值，避免每次渲染产生新时间戳而反复重取。
const sinceOf = (range: string): number | null => {
  if (range === "24h") return Date.now() - 24 * 60 * 60 * 1000;
  if (range === "7d") return Date.now() - 7 * 24 * 60 * 60 * 1000;
  return null;
};

// 无后端时的本地过滤：口径与后端 listAlertGroups 的 HAVING 保持一致
// （状态 = 组内包含任一该状态；等级 = 组内最高等级；时间 = 组内最近一次发生在该时刻之后）。
function filterGroupsLocally(groups: AlertGroup[], filters: AlertsFilterState, since: number | null): AlertGroup[] {
  const statuses = statusesParam(filters.status);
  return groups.filter((group) => {
    if (filters.poolId !== "全部" && group.poolId !== filters.poolId) return false;
    if (filters.metricId !== "全部" && group.metricId !== filters.metricId) return false;
    if (filters.level !== "全部" && group.maxLevel !== filters.level) return false;
    if (statuses && !statuses.some((status) => (group.statusCounts[status] ?? 0) > 0)) return false;
    // 内置数据没有数值时间戳（lastAt=0），无法判断时间范围时不做剔除，保证仍可浏览。
    if (since && group.lastAt > 0 && group.lastAt < since) return false;
    return true;
  });
}

// 本地状态覆盖的增量修正：只作用于「已加载记录」，把组卡状态分布与该组实际情况对齐。
// live 模式传的是会话级乐观值（PATCH 成功后即清除），demo 模式传本地持久化覆盖。
function applyStatusOverrides(
  base: Record<string, number>,
  records: AlertRecord[] | undefined,
  overrides: Record<string, string>,
): Record<string, number> {
  if (!records || records.length === 0) return base;
  const next = { ...base };
  for (const record of records) {
    const override = overrides[record.id];
    if (!override || override === record.status) continue;
    next[record.status] = Math.max(0, (next[record.status] ?? 0) - 1);
    next[override] = (next[override] ?? 0) + 1;
  }
  return next;
}

function omitKeys<T>(source: Record<string, T>, keys: string[]): Record<string, T> {
  const next = { ...source };
  for (const key of keys) delete next[key];
  return next;
}

export default function AlertsPage() {
  const { dataSource, alertStatuses, setAlertStatus, demoRunning } = useData();
  const live = dataSource === "live";
  const refreshInterval = live ? 15_000 : demoRunning ? DEMO_REFRESH_MS : 0;

  const [filters, setFilters] = usePersistentState<AlertsFilterState>("jack-alert-filters-v2", DEFAULT_FILTERS);
  const [selectedGroupKey, setSelectedGroupKey] = usePersistentState("jack-alert-group", "");
  const [selectedAlertId, setSelectedAlertId] = usePersistentState("jack-alert-selected", "");
  const [selectedAlertRange, setSelectedAlertRange] = usePersistentState("jack-alert-range", "24h");
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [windowCount, setWindowCount] = useState(GROUPS_WINDOW_STEP);
  const [detailOpen, setDetailOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [handlingNote, setHandlingNote] = useState("");
  const [handlingNotes, setHandlingNotes] = usePersistentState<
    Record<string, Array<{ title: string; description: string }>>
  >("jack-alert-handling-notes", {});
  // live 模式的状态改动只作「会话级乐观值」：PATCH 成功后立即清除，绝不落盘。
  // 否则服务端自动关闭的记录会被陈旧覆盖"复活"成未处理（幻影预警），并和导航角标口径打架。
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, string>>({});
  const [recordsByGroup, setRecordsByGroup] = useState<Record<string, AlertRecord[]>>({});
  const [recordsPages, setRecordsPages] = useState<Record<string, number>>({});
  const [recordsWanted, setRecordsWanted] = useState<Record<string, number>>({});
  const [saveError, setSaveError] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);

  const since = useMemo(() => sinceOf(filters.range), [filters.range]);
  // 指标名 → 指标 id：groupAlerts 需要它生成组键，而数据目录不能自行 import 指标字典
  // （见 src/app/data/alerts.ts 顶部约定：该目录会被 Node 服务端直接加载）。
  const metricIdsByName: Record<string, string> = useMemo(
    () => Object.fromEntries(METRIC_LIST.map((metric) => [metric.name, metric.id])),
    [],
  );

  // 事件组总表（不过滤）：驱动 L0 全局态势统计 —— 摘要卡必须反映全量口径，
  // 不能跟着筛选一起变，否则用户就失去了「全局基准」。
  const allFallback = useMemo(() => groupAlerts(alertsMock, metricIdsByName), [metricIdsByName]);
  const { data: allGroups, reload: reloadAllGroups } = useApiData<AlertGroup[]>(
    "/alerts/groups?pageSize=200",
    allFallback,
    { refreshInterval },
  );

  // 事件组列表（服务端过滤）：驱动 L1，保证筛选结果与数据库口径一致（不再只筛已加载的几十条）。
  const listedQuery = useMemo(() => {
    const params = new URLSearchParams();
    const statuses = statusesParam(filters.status);
    if (statuses) params.set("status", statuses.join(","));
    if (filters.poolId !== "全部") params.set("poolId", filters.poolId);
    if (filters.metricId !== "全部") params.set("metricId", filters.metricId);
    if (filters.level !== "全部") params.set("level", filters.level);
    if (since) params.set("from", String(since));
    params.set("pageSize", "200");
    return params.toString();
  }, [filters.status, filters.poolId, filters.metricId, filters.level, since]);

  const listedFallback = useMemo(
    () => filterGroupsLocally(allFallback, filters, since),
    [allFallback, filters, since],
  );
  const {
    data: listedGroups,
    total: listedTotal,
    source: listedSource,
    reload: reloadListedGroups,
  } = useApiData<AlertGroup[]>(`/alerts/groups?${listedQuery}`, listedFallback, { refreshInterval });

  // 生效的状态覆盖表：live 用会话乐观值，demo 用本地持久化覆盖。
  const overrideMap = live ? optimisticStatus : alertStatuses;

  const statusOf = useCallback(
    (record: AlertRecord): string => overrideMap[record.id] ?? record.status,
    [overrideMap],
  );

  // 记录是否落在当前「状态筛选」范围内 —— 用于详情默认选中与展开区提示，
  // 否则默认「待处置」时详情会直接展示一条被筛掉的「已关闭」记录。
  const matchesStatusFilter = useCallback(
    (record: AlertRecord): boolean => {
      const statuses = statusesParam(filters.status);
      if (!statuses) return true;
      return statuses.includes(statusOf(record));
    },
    [filters.status, statusOf],
  );

  const groupsByKey = useMemo(
    () => new Map(allGroups.map((group) => [groupKeyOf(group.poolId, group.metricId), group])),
    [allGroups],
  );

  const statusCountsOf = useCallback(
    (group: AlertGroup): Record<string, number> =>
      applyStatusOverrides(
        group.statusCounts,
        recordsByGroup[groupKeyOf(group.poolId, group.metricId)],
        overrideMap,
      ),
    [recordsByGroup, overrideMap],
  );

  // L0 全局统计：把所有事件组的（已按本地覆盖修正的）状态计数相加。
  const globalStatusCounts = useMemo(() => {
    const totals: Record<string, number> = { 未处理: 0, 处理中: 0, 观察中: 0, 已关闭: 0 };
    for (const group of allGroups) {
      const counts = statusCountsOf(group);
      for (const status of STATUS_OPTIONS) totals[status] += counts[status] ?? 0;
    }
    return totals;
  }, [allGroups, statusCountsOf]);

  const globalRecordTotal = useMemo(
    () => allGroups.reduce((sum, group) => sum + group.count, 0),
    [allGroups],
  );

  // 每类状态下「最严重的一条」：优先异常等级，其次最近发生 —— 摘要卡上一眼可读的要点。
  const topByStatus = useMemo(() => {
    const pick = (status: string): AlertGroup | null => {
      const candidates = allGroups.filter((group) => (statusCountsOf(group)[status] ?? 0) > 0);
      if (candidates.length === 0) return null;
      return [...candidates].sort((a, b) => {
        const abnormalDiff = (b.maxLevel === "异常" ? 1 : 0) - (a.maxLevel === "异常" ? 1 : 0);
        return abnormalDiff !== 0 ? abnormalDiff : b.lastAt - a.lastAt;
      })[0];
    };
    return {
      未处理: pick("未处理"),
      处理中: pick("处理中"),
      观察中: pick("观察中"),
      已关闭: pick("已关闭"),
    } as Record<string, AlertGroup | null>;
  }, [allGroups, statusCountsOf]);

  // 当前选中的事件组：优先用户选择；被筛掉时自动落到列表第一条（避免详情与列表失配）。
  const selectedGroup =
    listedGroups.find((group) => groupKeyOf(group.poolId, group.metricId) === selectedGroupKey) ??
    listedGroups[0] ??
    null;
  const activeKey = selectedGroup ? groupKeyOf(selectedGroup.poolId, selectedGroup.metricId) : null;

  // 需要明细的组 = 已展开的 ∪ 当前选中的（通常 1~2 个），按需懒加载，避免一次性拉全部记录。
  const neededKeys = useMemo(() => {
    const keys = new Set(expandedKeys);
    if (activeKey) keys.add(activeKey);
    return [...keys];
  }, [expandedKeys, activeKey]);

  // 组内明细按页拉取：默认第 1 页；用户点「加载更多」递增目标页，逐页追加（无上限丢失）。
  useEffect(() => {
    const pending = neededKeys.filter((key) => {
      if (!groupsByKey.has(key)) return false;
      const loadedPages = recordsPages[key] ?? 0;
      const wantedPages = Math.max(1, recordsWanted[key] ?? 1);
      return loadedPages < wantedPages;
    });
    if (pending.length === 0) return;
    let alive = true;
    for (const key of pending) {
      const group = groupsByKey.get(key);
      if (!group) continue;
      const page = (recordsPages[key] ?? 0) + 1;
      apiGet<AlertRecord[]>(
        `/alerts?poolId=${group.poolId}&metricId=${group.metricId}&page=${page}&pageSize=${RECORDS_PAGE_SIZE}`,
      )
        .then((envelope) => {
          if (!alive) return;
          setRecordsByGroup((prev) => ({
            ...prev,
            [key]: page === 1 ? envelope.data : [...(prev[key] ?? []), ...envelope.data],
          }));
          setRecordsPages((prev) => ({ ...prev, [key]: page }));
        })
        .catch(() => {
          // 无后端：用内置数据按同口径（同池 + 同指标名）一次性回退，并标记为「已取全」不再分页。
          if (!alive) return;
          setRecordsByGroup((prev) => ({
            ...prev,
            [key]: alertsMock.filter((item) => item.poolId === group.poolId && item.metric === group.metric),
          }));
          setRecordsPages((prev) => ({ ...prev, [key]: Number.MAX_SAFE_INTEGER }));
        });
    }
    return () => {
      alive = false;
    };
  }, [neededKeys, recordsPages, recordsWanted, groupsByKey]);

  // 组内记录数变化（演示/实时下持续写入）→ 丢弃该组缓存触发重新拉取。
  // 只对「单页即可取全」的组自动失效：超过一页的组若也自动失效，会因 count≠已加载数而反复重取（请求风暴）。
  useEffect(() => {
    const stale = Object.keys(recordsByGroup).filter((key) => {
      const group = groupsByKey.get(key);
      const records = recordsByGroup[key];
      if (!group || !records) return false;
      if ((recordsPages[key] ?? 1) !== 1) return false;
      return records.length < RECORDS_PAGE_SIZE && records.length !== group.count;
    });
    if (stale.length === 0) return;
    setRecordsByGroup((prev) => omitKeys(prev, stale));
    setRecordsPages((prev) => omitKeys(prev, stale));
    setRecordsWanted((prev) => omitKeys(prev, stale));
  }, [groupsByKey, recordsByGroup, recordsPages]);

  const activeRecords = activeKey ? recordsByGroup[activeKey] ?? [] : [];
  // 详情默认选中：优先「用户显式选中且仍在筛选范围内」的一条，
  // 否则取筛选范围内的最新一条，最后才退化为整组最新一条。
  const selectedAlert =
    (selectedAlertId
      ? activeRecords.find((record) => record.id === selectedAlertId && matchesStatusFilter(record))
      : undefined) ??
    activeRecords.find(matchesStatusFilter) ??
    activeRecords.find((record) => record.id === selectedAlertId) ??
    activeRecords[0] ??
    null;
  const selectedAlertStatus = selectedAlert ? statusOf(selectedAlert) : "";

  const poolOptions = useMemo(() => POOLS.map((pool) => ({ id: pool.id, name: pool.name })), []);
  const metricOptions = useMemo(() => METRIC_LIST.map((metric) => ({ id: metric.id, name: metric.name })), []);

  // 窄屏（<1024px）才把详情当模态抽屉：桌面端它是常驻右栏。
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const apply = () => setIsNarrow(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  // 抽屉的可关闭性与可访问性：Esc 关闭 + 锁背景滚动 + 打开后聚焦（此前只能靠点关闭按钮）。
  useEffect(() => {
    if (!detailOpen || !isNarrow) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    detailRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [detailOpen, isNarrow]);

  const handleFilterChange = useCallback(
    (next: Partial<AlertsFilterState>) => {
      setFilters((prev) => ({ ...prev, ...next }));
      setWindowCount(GROUPS_WINDOW_STEP);
    },
    [setFilters],
  );

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  }, []);

  const selectGroup = useCallback(
    (key: string) => {
      setSelectedGroupKey(key);
      setSelectedAlertId("");
    },
    [setSelectedGroupKey, setSelectedAlertId],
  );

  const loadMoreRecords = useCallback((key: string) => {
    setRecordsWanted((prev) => ({ ...prev, [key]: (prev[key] ?? 1) + 1 }));
  }, []);

  const invalidateGroupRecords = useCallback((key: string) => {
    setRecordsByGroup((prev) => omitKeys(prev, [key]));
    setRecordsPages((prev) => omitKeys(prev, [key]));
    setRecordsWanted((prev) => omitKeys(prev, [key]));
  }, []);

  const refreshGroups = useCallback(() => {
    reloadAllGroups();
    reloadListedGroups();
  }, [reloadAllGroups, reloadListedGroups]);

  // 状态处置：
  //   live —— 只写会话级乐观值 + PATCH 后端；PATCH 成功后清除乐观值并重取，DB 为唯一真源。
  //   demo —— 写本地持久化覆盖（页面已明示「保存在当前设备浏览器中」）。
  const updateSelectedAlertStatus = (status: string) => {
    if (!selectedAlert) return;
    const target = selectedAlert;
    if (!live) {
      setAlertStatus(target.id, status);
      return;
    }
    setSaveError("");
    setOptimisticStatus((prev) => ({ ...prev, [target.id]: status }));
    void apiSend(`/alerts/${target.id}`, "PATCH", { status })
      .then(() => {
        setOptimisticStatus((prev) => omitKeys(prev, [target.id]));
        if (activeKey) invalidateGroupRecords(activeKey);
        refreshGroups();
      })
      .catch(() => {
        // 写失败：撤销乐观值并如实提示，避免界面显示一个数据库里并不存在的状态。
        setOptimisticStatus((prev) => omitKeys(prev, [target.id]));
        setSaveError("处理状态未能写入后端，请检查实时数据源连接后重试。");
      });
  };

  const saveHandlingNote = () => {
    if (!selectedAlert || !handlingNote.trim()) return;
    const target = selectedAlert;
    const note = handlingNote.trim();
    setSaveError("");
    setHandlingNote("");
    if (!live) {
      setHandlingNotes((current) => ({
        ...current,
        [target.id]: [...(current[target.id] ?? []), { title: "已保存处理备注", description: note }],
      }));
      return;
    }
    // live：只写数据库，刷新后由记录自带 note 回显（不再写本地，避免"两边各存一份"）。
    void apiSend(`/alerts/${target.id}`, "PATCH", { note })
      .then(() => {
        if (activeKey) invalidateGroupRecords(activeKey);
        refreshGroups();
      })
      .catch(() => {
        setSaveError("处理备注未能写入后端，请检查实时数据源连接后重试。");
      });
  };

  return (
    <main className="system-page alerts-page min-h-screen px-5 py-6 text-[#d7e2ea] sm:px-10 sm:py-8">
      <SystemNavigation active="alerts" />
      <p className="system-demo-notice">
        {live
          ? "实时数据源：处理状态与备注直接写入后端数据库，刷新或换设备后仍然保持，并同步导航角标与统计。"
          : "本页记录为演示预警数据；处理状态和备注保存在当前设备浏览器中，仅本机可见，也不会改变数据库与导航角标（写入数据库请切换到实时数据源）。"}
      </p>

      <section className="alerts-content mx-auto max-w-6xl py-3">
        <div className="alerts-overview-header">
          <PageHeader
            title="异常预警中心"
            subtitle="按「育苗池 × 指标」聚合事件，逐条记录仍完整保留，可展开查看并就地处置。"
          />
        </div>

        <AlertsSummaryBar
          statusCounts={globalStatusCounts}
          topByStatus={topByStatus}
          activeFilter={filters.status}
          onFilter={(status) => handleFilterChange({ status })}
          groupCount={allGroups.length}
          recordTotal={globalRecordTotal}
          poolCount={new Set(allGroups.map((group) => group.poolId)).size}
        />

        {saveError && (
          <p className="mt-4 rounded-xl border border-rose-300/30 bg-rose-300/[0.08] px-4 py-3 text-sm text-rose-200">
            {saveError}
          </p>
        )}

        {/* 桌面端详情按内容展开，左右栏等高；长事件列表仍可独立滚动。 */}
        <div className="alerts-layout">
          <AlertsGroupList
            groups={listedGroups}
            totalGroups={listedTotal ?? listedGroups.length}
            degraded={listedSource === "mock"}
            windowCount={windowCount}
            onShowMore={() => setWindowCount((count) => count + GROUPS_WINDOW_STEP)}
            filters={filters}
            onFilterChange={handleFilterChange}
            poolOptions={poolOptions}
            metricOptions={metricOptions}
            expandedKeys={expandedKeys}
            onToggleExpand={toggleExpand}
            selectedKey={activeKey}
            recordsByGroup={recordsByGroup}
            onLoadMoreRecords={loadMoreRecords}
            statusCountsOf={statusCountsOf}
            statusOf={statusOf}
            matchesStatusFilter={matchesStatusFilter}
            selectedAlertId={selectedAlert?.id ?? null}
            onSelectRecord={(record) => {
              setSelectedAlertId(record.id);
              setDetailOpen(true);
            }}
            onOpenDetail={(key) => {
              selectGroup(key);
              setDetailOpen(true);
            }}
            onClearFilters={() => handleFilterChange(DEFAULT_FILTERS)}
          />

          <div
            ref={detailRef}
            className={`alerts-detail-wrap ${detailOpen ? "is-open" : ""}`}
            role={isNarrow ? "dialog" : undefined}
            aria-modal={isNarrow && detailOpen ? true : undefined}
            aria-label={isNarrow ? "预警记录详情" : undefined}
            tabIndex={-1}
            onClick={(event) => {
              // 窄屏下点击抽屉空白处（背景）关闭；桌面端详情是常驻右栏，不受影响。
              if (isNarrow && event.target === event.currentTarget) setDetailOpen(false);
            }}
          >
            {selectedAlert ? (
              <AlertsDetailPanel
                key={selectedAlert.id}
                alert={selectedAlert}
                status={selectedAlertStatus}
                statusOptions={STATUS_OPTIONS}
                range={selectedAlertRange}
                onRangeChange={setSelectedAlertRange}
                metricIdsByName={metricIdsByName}
                persistedNote={selectedAlert.note ?? ""}
                // live 只认数据库里的备注；本地历史备注只在 demo 模式（明示「保存在当前设备」）下展示。
                notes={live ? [] : handlingNotes[selectedAlert.id] ?? []}
                noteDraft={handlingNote}
                onNoteDraftChange={setHandlingNote}
                onSaveNote={saveHandlingNote}
                onStatusChange={updateSelectedAlertStatus}
                onClose={() => setDetailOpen(false)}
              />
            ) : (
              <section className="flex min-h-96 items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm text-[#d7e2ea]/50">
                当前筛选条件下没有可查看的记录详情。
              </section>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
