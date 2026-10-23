"use client";

// 网页自动演示（导览）——面向比赛展示 / 向老师汇报的场景。
// 自动依次切换到各核心模块，底部解说条同步给出「模块名 + 一句旁白 + 技术亮点」，
// 并全程驱动数据高频刷新，使仪表盘 / 趋势图 / 预警角标肉眼可见地变化。
// 全程无需人工操作（默认自动播放到底）；只保留「暂停 / 下一模块 / 退出」三个可选控制，
// 方便现场答疑时临时停住或跳过。演示脚本集中在 DEMO_TOUR_STEPS，改文案与节奏只动这张表。
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
import { ChevronRight, Pause, Play, Square } from "lucide-react";
import { useData } from "@/app/components/DataContext";
import type { ScenarioMode } from "@/app/data/pools";

// 与后端 simulator SCENARIO_LABELS 一致的场景中文名。
const SCENARIO_LABELS: Record<ScenarioMode, string> = {
  normal: "正常运行",
  warning: "轻度预警",
  abnormal: "异常事件",
  recovery: "异常恢复",
};

export interface DemoTourStep {
  // hash 路由，与站内导航一致；演示据此自动切页。
  route: string;
  // 模块名：解说条上最醒目的一行。
  module: string;
  // 一句旁白：这一屏在做什么、有什么用。
  narration: string;
  // 技术亮点：补充说明，可省略。
  highlight?: string;
  // 本步停留时长（毫秒）——整体节奏由这张表控制。
  durationMs: number;
  // 需要强调的区块（选择器）；切页后自动滚动到该区块，避免讲解与画面错位。
  focus?: string;
  // 进入本步时切换到该监测场景，用于展示「场景切换 → 仪表盘/角标联动」。
  scenario?: ScenarioMode;
}

// 9 步 ≈ 3 分钟：介绍页 → 驾驶舱（状态/数据源场景/趋势）→ 预警中心 → 投放记录 → 投放后监测 → 育苗池管理 → 收尾。
export const DEMO_TOUR_STEPS: DemoTourStep[] = [
  {
    route: "/",
    module: "产品介绍 · 平台定位",
    narration:
      "面向贝类育苗场景的水质监测平台：4 个育苗池、6 项水质指标持续监测，并按正常 / 预警 / 异常三级自动判定。",
    highlight: "四大功能区 —— 综合驾驶舱、异常预警中心、育苗池管理、投放管理。",
    durationMs: 18_000,
  },
  {
    route: "/main",
    module: "综合驾驶舱 · 育苗池状态",
    narration:
      "一屏掌握全局：4 个育苗池的运行状态与实时读数，未处理的异常数量直接标在导航角标上。",
    highlight: "6 个指标仪表盘每 5 秒刷新一次，表盘指针与状态色随读数实时联动。",
    durationMs: 20_000,
    focus: '[data-tour="gauges"]',
    scenario: "normal",
  },
  {
    route: "/main",
    module: "综合驾驶舱 · 数据源与监测场景",
    narration:
      "演示数据源与实时数据源一键切换：接上真实传感器即为实时监测，没有设备也能完整演示。",
    highlight: "切换监测场景后，仪表盘读数、状态色与导航角标会立即联动变化。",
    durationMs: 22_000,
    focus: '[data-tour="source"]',
    scenario: "warning",
  },
  {
    route: "/main",
    module: "综合驾驶舱 · 指标趋势",
    narration:
      "传感器上报 → 后端校验入库 → 业务接口返回 → 前端绘图，一条完整且可追溯的数据链路。",
    highlight: "历史曲线支持最近 1 小时 / 6 小时 / 24 小时 / 7 天切换，随时间范围实时重绘。",
    durationMs: 20_000,
    focus: '[data-tour="trend"]',
  },
  {
    route: "/main/alerts",
    module: "异常预警中心",
    narration:
      "越限数据自动生成预警，按未处理 / 处理中 / 观察中 / 已关闭分级，并逐条给出异常指标与系统建议。",
    highlight: "处理状态流转、处理备注与事件时间线全程留痕，异常处置过程可追溯、可复盘。",
    durationMs: 24_000,
    scenario: "abnormal",
  },
  {
    route: "/main/dosing-records",
    module: "投放管理 · 投放记录",
    narration:
      "以台账形式留存每次投放的育苗池、药剂、浓度、剂量、操作人与结果，便于追溯与留档。",
    highlight: "新增投放的同时自动建立投放后监测任务 —— 记录与监测天然成对，不漏项。",
    durationMs: 20_000,
  },
  {
    route: "/main/monitoring",
    module: "投放管理 · 投放后监测",
    narration: "逐项对比投放前后的水质变化，跟踪各指标恢复进度，并给出综合效果评价。",
    highlight: "效果评价仅用于辅助决策，最终结论需结合幼虫附着率、变态率与现场观察综合判断。",
    durationMs: 24_000,
    focus: '[data-tour="compare"]',
  },
  {
    route: "/main/pools",
    module: "育苗池管理",
    narration: "每个育苗池的苗种、批次、负责人与当前六项水质一页看全。",
    highlight: "汇总该池的水质历史、异常处理、投放与投放后监测记录，并可一键导出育苗池报告。",
    durationMs: 20_000,
  },
  {
    route: "/main",
    module: "演示结束 · 技术亮点",
    narration:
      "全链路：传感器数据接入 → SQLite 入库 → 业务接口 → 前端可视化；阈值判定与预警联动在服务端完成。",
    highlight: "后端不可达时前端自动降级到内置数据，站点始终可用、不白屏，没有设备也能讲清楚。",
    durationMs: 16_000,
    scenario: "recovery",
  },
];

interface DemoTourValue {
  running: boolean;
  paused: boolean;
  index: number;
  total: number;
  step: DemoTourStep;
  // 当前步进度 0~1，用于解说条上的进度显示。
  progress: number;
  start: () => void;
  stop: () => void;
  togglePause: () => void;
  goNext: () => void;
}

const DemoTourContext = createContext<DemoTourValue | null>(null);

export function DemoTourProvider({ children }: { children: ReactNode }) {
  const { setScenario, setDemoRunning } = useData();
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  // 计时基准：stepStart = 本次续播的起始时间戳；carried = 暂停前已累计的毫秒。
  // 两者相加得到本步真实已用时长，因此暂停/继续不会跳步或重置进度。
  const stepStart = useRef(0);
  const carried = useRef(0);

  const total = DEMO_TOUR_STEPS.length;
  const step = DEMO_TOUR_STEPS[index] ?? DEMO_TOUR_STEPS[0];
  const duration = step.durationMs;

  const start = useCallback(() => {
    setIndex(0);
    setPaused(false);
    setProgress(0);
    setRunning(true);
  }, []);

  const stop = useCallback(() => {
    setRunning(false);
    setPaused(false);
    setProgress(0);
    setDemoRunning(false);
  }, [setDemoRunning]);

  const togglePause = useCallback(() => setPaused((prev) => !prev), []);

  const goNext = useCallback(() => {
    setIndex((prev) => (prev + 1) % DEMO_TOUR_STEPS.length);
  }, []);

  // 运行期间打开全局数据运行态：切到演示数据源 + 5s 轮询 + 后端业务闭环心跳（沿用既有实现）。
  useEffect(() => {
    if (running) setDemoRunning(true);
  }, [running, setDemoRunning]);

  // 讲解时给页面底部留出解说条的高度，避免遮挡正文/页脚。
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("demo-tour-on", running);
    return () => root.classList.remove("demo-tour-on");
  }, [running]);

  // 步骤切换：自动切页 + 场景联动 + 滚动定位，并重置本步计时。
  useEffect(() => {
    if (!running) return;
    carried.current = 0;
    stepStart.current = Date.now();
    setProgress(0);

    if (window.location.hash !== `#${step.route}`) {
      window.location.hash = step.route;
    }
    if (step.scenario) setScenario(step.scenario);

    let focusTimer = 0;
    const focusSelector = step.focus;
    if (focusSelector) {
      // 等路由切换与页面渲染完成后再滚动，否则拿不到目标节点。
      focusTimer = window.setTimeout(() => {
        document.querySelector(focusSelector)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 700);
    }
    return () => {
      if (focusTimer) window.clearTimeout(focusTimer);
    };
  }, [running, index, step, setScenario]);

  // 计时推进：暂停时冻结；到点自动进入下一步，最后一步结束即自动收尾。
  useEffect(() => {
    if (!running || paused) return;
    stepStart.current = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = carried.current + (Date.now() - stepStart.current);
      const ratio = Math.min(1, elapsed / duration);
      setProgress(ratio);
      if (ratio < 1) return;
      if (index + 1 >= total) {
        setRunning(false);
        setProgress(0);
        setDemoRunning(false);
      } else {
        setIndex(index + 1);
      }
    }, 120);
    return () => {
      window.clearInterval(timer);
      carried.current = Math.min(duration, carried.current + (Date.now() - stepStart.current));
    };
  }, [running, paused, index, duration, total, setDemoRunning]);

  const value = useMemo<DemoTourValue>(
    () => ({ running, paused, index, total, step, progress, start, stop, togglePause, goNext }),
    [running, paused, index, total, step, progress, start, stop, togglePause, goNext],
  );

  return <DemoTourContext.Provider value={value}>{children}</DemoTourContext.Provider>;
}

export function useDemoTour(): DemoTourValue {
  const ctx = useContext(DemoTourContext);
  if (!ctx) throw new Error("useDemoTour() 必须在 <DemoTourProvider> 内使用");
  return ctx;
}

// 解说条：固定在底部居中，展示「第几步 / 模块 / 旁白 / 技术亮点 / 当前场景」+ 播放控制。
export function DemoTourOverlay() {
  const { running, paused, index, total, step, progress, stop, togglePause, goNext } = useDemoTour();
  const { scenario } = useData();
  if (!running) return null;

  const overall = Math.min(1, (index + progress) / total);

  return (
    <div className={`demo-tour-bar ${paused ? "is-paused" : ""}`} role="status" aria-live="polite">
      <div className="demo-tour-progress" aria-hidden="true">
        <span style={{ width: `${overall * 100}%` }} />
      </div>
      <div className="demo-tour-body">
        <div className="demo-tour-head">
          <span className="demo-tour-dot" aria-hidden="true" />
          <span className="demo-tour-step">
            {index + 1} / {total}
          </span>
          <span className="demo-tour-module">{step.module}</span>
          <span className="demo-tour-scene">场景 {SCENARIO_LABELS[scenario]}</span>
          {paused && <span className="demo-tour-paused">已暂停</span>}
        </div>
        <p className="demo-tour-narration">{step.narration}</p>
        {step.highlight && <p className="demo-tour-highlight">{step.highlight}</p>}
      </div>
      <div className="demo-tour-actions">
        <button
          type="button"
          onClick={togglePause}
          title={paused ? "继续自动播放" : "暂停自动播放（方便现场答疑）"}
        >
          {paused ? <Play aria-hidden="true" size={14} strokeWidth={2} /> : <Pause aria-hidden="true" size={14} strokeWidth={2} />}
          <span>{paused ? "继续" : "暂停"}</span>
        </button>
        <button type="button" onClick={goNext} title="跳到下一模块">
          <ChevronRight aria-hidden="true" size={15} strokeWidth={2} />
          <span>下一模块</span>
        </button>
        <button type="button" onClick={stop} title="退出自动演示，数据恢复静态">
          <Square aria-hidden="true" size={13} strokeWidth={2} />
          <span>退出演示</span>
        </button>
      </div>
    </div>
  );
}
