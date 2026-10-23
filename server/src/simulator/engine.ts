// 模拟数据生成器（B6 + B7）。每池每指标维护「有状态随机游走」：
//   next = clamp(prev + 均值回归项(拉向场景目标) + 缓变漂移 + 高斯噪声)，单步 ≤ 量程 ~2% 保证连续性。
// 每 tick 生成 池×指标(v1=4×6=24) 行，用单事务批量 INSERT（B7），写入后走 alertService 阈值联动。
// 首启若时序表为空 → 回填 24h/10min 步长历史（B6，避免前端图表首启空白）。
import type { Database } from "../db/driver.ts";
import {
  METRIC_ORDER,
  getMetric,
  normalizeMetricId,
  deriveStatus,
  type MetricStatus,
} from "../../../src/app/data/metrics.ts";
import { POOLS } from "../../../src/app/data/pools.ts";
import * as wq from "../repositories/waterQualityRepo.ts";
import { updatePoolStatus } from "../repositories/poolsRepo.ts";
import { touchAllSensors } from "../repositories/sensorsRepo.ts";
import { evaluateReading } from "../services/alertService.ts";
import {
  targetValue,
  scenarioFromPoolStatus,
  type ScenarioMode,
} from "./scenario.ts";

const stateKey = (poolId: string, metricId: string): string => `${poolId}|${metricId}`;

// 标准正态随机数（Box–Muller）。
function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const STATUS_RANK: Record<MetricStatus, number> = { 正常: 0, 预警: 1, 异常: 2 };

function worseOf(a: MetricStatus | undefined, b: MetricStatus): MetricStatus {
  if (!a) return b;
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
}

export interface TickResult {
  inserted: number;
  alertsCreated: number;
  alertsClosed: number;
  at: number;
}

export class SimulatorEngine {
  private db: Database;
  private state = new Map<string, number>(); // (池|指标) → 上一次值
  private scenarios = new Map<string, ScenarioMode>(); // 池 → 当前场景
  private busy = false; // B11 守卫：上一次 tick 未完成则跳过

  // 注意：Node type-stripping 不支持「参数属性」(constructor(private db))，故显式声明字段 + 构造器赋值。
  constructor(db: Database) {
    this.db = db;
    // 初始场景由各池 seeded 状态派生，保证首帧模拟与池状态一致（pool-3 异常、pool-2 预警、其余正常）。
    for (const p of POOLS) {
      this.scenarios.set(p.id, scenarioFromPoolStatus(p.status));
    }
  }

  getScenario(poolId: string): ScenarioMode {
    return this.scenarios.get(poolId) ?? "normal";
  }

  // poolId 为空 → 设置全部池（演示「一键切场景」）。
  // 切到离散场景(normal/warning/abnormal)：把游走状态跳到新目标附近，使下一 tick 立即体现新场景
  //   （场景切换 = 条件突变的离散演示事件，允许一次跳变；场景内仍是连续随机游走）。
  // 切到 recovery：保留当前状态，靠较快均值回归(0.32)自然回归正常，体现「恢复曲线」。
  setScenario(poolId: string | undefined | null, scenario: ScenarioMode): void {
    const targets = poolId ? [poolId] : POOLS.map((p) => p.id);
    for (const pid of targets) {
      this.scenarios.set(pid, scenario);
      if (scenario !== "recovery") this.jumpToScenario(pid, scenario);
    }
  }

  private jumpToScenario(poolId: string, scenario: ScenarioMode): void {
    for (const metricId of METRIC_ORDER) {
      const m = getMetric(metricId);
      const target = targetValue(metricId, scenario);
      const jitter = (Math.random() - 0.5) * (m.max - m.min) * 0.01;
      const value = Math.max(m.min, Math.min(m.max, target + jitter));
      this.state.set(stateKey(poolId, metricId), Number(value.toFixed(m.decimals)));
    }
  }

  scenariosSnapshot(): Record<string, ScenarioMode> {
    return Object.fromEntries(this.scenarios);
  }

  // 重启续接：用 DB 最新读数填充游走状态，避免首个 tick 相对上次持久值发生跳变（空表时 no-op）。
  hydrateFromDb(): void {
    for (const r of wq.latestPerMetric(this.db)) {
      this.state.set(stateKey(r.poolId, normalizeMetricId(r.metricId)), r.value);
    }
  }

  // 单步随机游走，返回四舍五入到指标精度后的值（DB 存的即展示值，避免边界舍入导致状态翻转）。
  private nextValue(poolId: string, metricId: string, scenario: ScenarioMode, now: number): number {
    const m = getMetric(metricId);
    const target = targetValue(metricId, scenario);
    const key = stateKey(poolId, metricId);
    let prev = this.state.get(key);
    if (prev === undefined) {
      prev = target;
      this.state.set(key, prev);
    }
    const span = m.max - m.min;
    const maxStep = span * 0.02; // 相邻采样差 ≤ 量程 ~2%，保证连续性
    // 均值回归：recovery 场景回归更快（体现指数恢复），其余常规回归。
    const reversion = scenario === "recovery" ? 0.32 : 0.18;
    let delta = (target - prev) * reversion;
    // 缓变漂移：低频正弦，相位随池/指标不同，避免所有曲线同步。
    const phase = poolId.length * 7 + metricId.length * 13;
    delta += Math.sin(now / 600000 + phase) * maxStep * 0.25;
    // 高斯噪声
    delta += gauss() * maxStep * 0.4;
    delta = Math.max(-maxStep, Math.min(maxStep, delta));
    const next = Math.max(m.min, Math.min(m.max, prev + delta));
    const rounded = Number(next.toFixed(m.decimals));
    this.state.set(key, rounded);
    return rounded;
  }

  // 首启回填：时序表为空时，生成 [now-24h, now] 每 10min 一条历史（145 步 × 4 池 × 6 指标）。
  backfill24h(now = Date.now()): number {
    if (!wq.isEmpty(this.db)) return 0;
    const stepMs = 10 * 60 * 1000;
    const steps = Math.round((24 * 3600 * 1000) / stepMs); // 144
    // 先把 state 初始化到各池目标值，正向游走使末端贴近当前场景。
    for (const p of POOLS) {
      const scenario = this.getScenario(p.id);
      for (const metricId of METRIC_ORDER) {
        this.state.set(stateKey(p.id, metricId), targetValue(metricId, scenario));
      }
    }
    const records: wq.NewRecord[] = [];
    for (let i = steps; i >= 0; i -= 1) {
      const t = now - i * stepMs;
      for (const p of POOLS) {
        const scenario = this.getScenario(p.id);
        for (const metricId of METRIC_ORDER) {
          const value = this.nextValue(p.id, metricId, scenario, t);
          records.push({
            poolId: p.id,
            sensorId: `sensor-${p.id}-${metricId}`,
            metricId,
            value,
            status: deriveStatus(metricId, value),
            scenario,
            source: "demo",
            recordedAt: t,
          });
        }
      }
    }
    // 回填只写时序，不做告警联动（seed 已提供历史预警；避免为 145 步历史刷屏告警）。
    return wq.insertBatch(this.db, records);
  }

  // 单次 tick：生成当前时刻全部读数 → 单事务批写 → 阈值联动告警 → 刷新传感器/池状态。
  tick(now = Date.now()): TickResult {
    if (this.busy) return { inserted: 0, alertsCreated: 0, alertsClosed: 0, at: now };
    this.busy = true;
    try {
      const records: wq.NewRecord[] = [];
      const readings: { poolId: string; metricId: string; value: number; status: MetricStatus }[] = [];
      for (const p of POOLS) {
        const scenario = this.getScenario(p.id);
        for (const metricId of METRIC_ORDER) {
          const value = this.nextValue(p.id, metricId, scenario, now);
          const status = deriveStatus(metricId, value);
          records.push({
            poolId: p.id,
            sensorId: `sensor-${p.id}-${metricId}`,
            metricId,
            value,
            status,
            scenario,
            source: "demo",
            recordedAt: now,
          });
          readings.push({ poolId: p.id, metricId, value, status });
        }
      }

      const inserted = wq.insertBatch(this.db, records); // B7：单事务批写，一次 fsync 落全部

      // B7：阈值联动 alerts（冷却去重 / 恢复自动关闭）。
      let alertsCreated = 0;
      let alertsClosed = 0;
      for (const r of readings) {
        const res = evaluateReading(this.db, { ...r, recordedAt: now }, now);
        if (res.created) alertsCreated += 1;
        if (res.closed) alertsClosed += 1;
      }

      touchAllSensors(this.db, now);
      this.syncPoolStatus(readings);
      return { inserted, alertsCreated, alertsClosed, at: now };
    } finally {
      this.busy = false;
    }
  }

  // 池整体状态 = 该池最新一批读数中的最差状态（实时联动，单一口径）。
  private syncPoolStatus(
    readings: { poolId: string; status: MetricStatus }[],
  ): void {
    const worst = new Map<string, MetricStatus>();
    for (const r of readings) {
      worst.set(r.poolId, worseOf(worst.get(r.poolId), r.status));
    }
    for (const [poolId, status] of worst) {
      updatePoolStatus(this.db, poolId, status);
    }
  }
}
