// 预警服务：B7 阈值联动（读数 → 生成/冷却去重/自动关闭预警）+ 预警查询与流转的业务封装。
// 判定统一走 metrics.deriveStatus（单一口径）；本服务不直接拼 SQL，全部经 alertsRepo。
import type { Database } from "../db/driver.ts";
import type { AlertRecord } from "../../../src/app/data/alerts.ts";
import {
  getMetric,
  normalizeMetricId,
  deriveStatus,
  type MetricStatus,
} from "../../../src/app/data/metrics.ts";
import { formatMetricValue, isLowSideStress } from "../lib/metric.ts";
import { formatDisplayTime } from "../lib/time.ts";
import {
  findOpenByPoolMetric,
  insertAlert,
  closeAlert,
  listAlerts as repoListAlerts,
  listAlertGroups as repoListAlertGroups,
  getAlertById as repoGetAlertById,
  updateAlert as repoUpdateAlert,
  countOpen as repoCountOpen,
  countOpenByPool as repoCountOpenByPool,
  type AlertQuery,
  type AlertGroupQuery,
  type AlertPatch,
} from "../repositories/alertsRepo.ts";

export interface ReadingForEval {
  poolId: string;
  metricId: string;
  value: number;
  status?: MetricStatus | string;
  recordedAt: number;
}

export interface EvalResult {
  created: boolean;
  closed: boolean;
  alertId?: string;
}

// 由指标与状态生成预警文案（level=状态本身；异常/预警措辞不同；方向由指标语义决定）。
function buildCopy(
  metricId: string,
  status: string,
): { description: string; suggestion: string; action: string } {
  const m = getMetric(metricId);
  const low = isLowSideStress(metricId);
  const abnormal = status === "异常";
  const direction = low ? "偏低" : "偏高";
  const description = abnormal
    ? `${m.name}${direction}并已超出安全范围，可能影响幼虫活力与附着变态，请及时处置。`
    : `${m.name}${direction}，已接近正常范围边界，需要加强观察。`;
  const suggestion = abnormal
    ? `建议立即核查${m.name}相关设备与换水情况，并持续跟踪其变化。`
    : `建议提高${m.name}监测频率，密切关注后续变化趋势。`;
  const action = abnormal ? `现场处置并复核${m.name}` : `加密监测${m.name}变化`;
  return { description, suggestion, action };
}

// B7 核心：评估单条读数。
//   正常 → 若有未关闭预警则自动置「已关闭」并写 result（异常恢复）；
//   预警/异常 → 若已有未关闭预警则跳过（冷却去重，不刷屏），否则新建一条。
export function evaluateReading(db: Database, r: ReadingForEval, now = Date.now()): EvalResult {
  const status = (r.status ?? deriveStatus(r.metricId, r.value)) as MetricStatus;
  const metricId = normalizeMetricId(r.metricId);
  const at = Number.isFinite(r.recordedAt) ? r.recordedAt : now;
  const open = findOpenByPoolMetric(db, r.poolId, metricId);

  if (status === "正常") {
    if (open) {
      closeAlert(db, String(open.id), "指标已恢复正常", at);
      return { created: false, closed: true, alertId: String(open.id) };
    }
    return { created: false, closed: false };
  }

  if (open) {
    return { created: false, closed: false, alertId: String(open.id) };
  }

  const id = `alert-${at.toString(36)}-${r.poolId}-${metricId}`;
  const copy = buildCopy(metricId, status);
  insertAlert(db, {
    id,
    poolId: r.poolId,
    metricId,
    level: status, // "预警" | "异常"
    valueText: formatMetricValue(metricId, r.value),
    status: "未处理",
    timeText: formatDisplayTime(at, now),
    description: copy.description,
    suggestion: copy.suggestion,
    action: copy.action,
    result: "等待现场处理",
    triggeredAt: at,
    closedAt: null,
  });
  return { created: true, closed: false, alertId: id };
}

// ── 查询 / 流转封装（路由直接调用，保持路由薄）─────────────────────────────
export function listAlerts(db: Database, query?: AlertQuery) {
  return repoListAlerts(db, query);
}
// 事件组聚合（池 × 指标）：预警中心折叠列表用，保持路由薄。
export function listAlertGroups(db: Database, query?: AlertGroupQuery) {
  return repoListAlertGroups(db, query);
}
export function getAlert(db: Database, id: string): AlertRecord | undefined {
  return repoGetAlertById(db, id);
}
export function patchAlert(db: Database, id: string, patch: AlertPatch): boolean {
  return repoUpdateAlert(db, id, patch);
}
export function countOpen(db: Database): number {
  return repoCountOpen(db);
}
export function countOpenByPool(db: Database): Record<string, number> {
  return repoCountOpenByPool(db);
}
