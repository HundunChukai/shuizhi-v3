// 场景 → 目标值映射（B6）。目标值全部由 metrics.ts 阈值计算，无魔数。
// 场景对齐需求⑦：正常运行 / 轻度预警 / 异常事件 / 异常恢复。
import {
  getMetric,
  type MetricStatus,
} from "../../../src/app/data/metrics.ts";
import { isLowSideStress } from "../lib/metric.ts";

// 与前端 pools.ts 的 ScenarioMode 保持一致，作为跨前后端的场景规范键。
export type ScenarioMode = "normal" | "warning" | "abnormal" | "recovery";

export const SCENARIO_MODES: ScenarioMode[] = ["normal", "warning", "abnormal", "recovery"];

export const SCENARIO_LABELS: Record<ScenarioMode, string> = {
  normal: "正常运行",
  warning: "轻度预警",
  abnormal: "异常事件",
  recovery: "异常恢复",
};

export function isScenarioMode(v: unknown): v is ScenarioMode {
  return typeof v === "string" && (SCENARIO_MODES as string[]).includes(v);
}

// 由阈值计算某指标在某场景下的目标值：
//   normal / recovery → 正常带中值（recovery 的「指数回归」由引擎均值回归实现，目标同为正常中值）
//   warning           → 从正常边界向预警边界推进 60%，确保落在预警带内
//   abnormal          → 越过预警边界、向量程端推进 40%，确保落在异常区
export function targetValue(metricId: string, scenario: ScenarioMode): number {
  const m = getMetric(metricId);
  const normalMid = (m.normalLow + m.normalHigh) / 2;
  const low = isLowSideStress(metricId);
  if (scenario === "normal" || scenario === "recovery") return normalMid;
  if (scenario === "warning") {
    return low
      ? m.normalLow - (m.normalLow - m.warningLow) * 0.6
      : m.normalHigh + (m.warningHigh - m.normalHigh) * 0.6;
  }
  // abnormal
  return low
    ? m.warningLow - (m.warningLow - m.min) * 0.4
    : m.warningHigh + (m.max - m.warningHigh) * 0.4;
}

// 池整体状态（POOLS.status，MetricStatus）→ 初始场景，保证首帧模拟与 seeded 池状态一致。
export function scenarioFromPoolStatus(status: MetricStatus | string): ScenarioMode {
  if (status === "异常") return "abnormal";
  if (status === "预警") return "warning";
  return "normal";
}
