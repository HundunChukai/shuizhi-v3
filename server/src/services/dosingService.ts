// 投放 → 监测全链路服务（B8）。
//   createDosingWithMonitoring：写投放记录 + 同建监测任务（before_metrics = 该池最近读数快照）；
//   closeMonitoring：after_metrics = 最新读数，服务端算 change/state/recovery/result/conclusion。
import type { Database } from "../db/driver.ts";
import {
  getMetric,
  normalizeMetricId,
  deriveStatus,
  type MetricStatus,
} from "../../../src/app/data/metrics.ts";
import type {
  MonitoringTask,
  MonitoringMetricBefore,
  MonitoringMetricAfter,
} from "../../../src/app/data/monitoringTasks.ts";
import type { DosingRecord } from "../../../src/app/data/dosingRecords.ts";
import { getPoolById } from "../repositories/poolsRepo.ts";
import { insertDosing, getDosingById } from "../repositories/dosingRepo.ts";
import {
  insertMonitoring,
  getMonitoringById,
  updateMonitoring,
} from "../repositories/monitoringRepo.ts";
import { latestForPool } from "./waterQualityService.ts";
import { formatDisplayTime } from "../lib/time.ts";
import { ApiError } from "../lib/httpError.ts";

const RANK: Record<string, number> = { 正常: 0, 预警: 1, 异常: 2 };

// 展示串 "22.6℃" / "6.3 mg/L" → 数值（parseFloat 自动忽略尾部单位）。
function parseNum(display: string): number {
  const n = Number.parseFloat(display);
  return Number.isFinite(n) ? n : NaN;
}

function snapshotBefore(db: Database, poolId: string): MonitoringMetricBefore[] {
  return latestForPool(db, poolId).map((r) => ({
    id: r.id,
    name: r.name,
    value: `${r.value}${r.unit}`,
  }));
}

export interface CreateDosingInput {
  poolId: string;
  agent: string;
  concentration?: string;
  dosage?: string;
  operator: string;
  result?: string;
  note?: string;
  duration?: string;
}

export function createDosingWithMonitoring(
  db: Database,
  input: CreateDosingInput,
  now = Date.now(),
): { dosing: DosingRecord; monitoring: MonitoringTask } {
  const pool = getPoolById(db, input.poolId);
  if (!pool) throw new ApiError(400, `未知育苗池: ${input.poolId}`);
  if (!input.agent || !input.operator) {
    throw new ApiError(400, "投放记录需包含 agent 与 operator");
  }

  const rand = Math.random().toString(36).slice(2, 7);
  const dosingId = `dosing-${now.toString(36)}-${rand}`;
  const timeText = formatDisplayTime(now, now);
  insertDosing(db, {
    id: dosingId,
    poolId: pool.id,
    batch: pool.batch,
    agent: input.agent,
    concentration: input.concentration ?? "—",
    dosage: input.dosage ?? "—",
    operator: input.operator,
    result: input.result ?? "已投放",
    note: input.note ?? "",
    timeText,
    dosedAt: now,
  });

  const beforeMetrics = snapshotBefore(db, pool.id);
  const monitoringId = `monitor-${now.toString(36)}-${rand}`;
  insertMonitoring(db, {
    id: monitoringId,
    poolId: pool.id,
    dosingRecordId: dosingId,
    agent: input.agent,
    concentration: input.concentration ?? "—",
    dosage: input.dosage ?? "—",
    status: "正在监测",
    result: "观察中",
    description: `投放${input.agent}后进入监测窗口，持续观察水质与幼虫状态变化。`,
    duration: input.duration ?? "6小时",
    conclusion: "监测进行中，等待收尾复核",
    recovery: "持续观察",
    beforeMetrics,
    afterMetrics: [],
    startTimeText: timeText,
    startedAt: now,
    measuredAt: null,
  });

  const dosing = getDosingById(db, dosingId);
  const monitoring = getMonitoringById(db, monitoringId);
  if (!dosing || !monitoring) throw new ApiError(500, "投放/监测写入后回读失败");
  return { dosing, monitoring };
}

export function closeMonitoring(db: Database, id: string, now = Date.now()): MonitoringTask {
  const task = getMonitoringById(db, id);
  if (!task) throw new ApiError(404, `未知监测任务: ${id}`);

  const beforeById = new Map<string, MonitoringMetricBefore>();
  for (const b of task.beforeMetrics ?? []) beforeById.set(normalizeMetricId(b.id), b);

  const latest = latestForPool(db, task.poolId);
  const afterMetrics: MonitoringMetricAfter[] = latest.map((r) => {
    const b = beforeById.get(r.id);
    const beforeRaw = b ? parseNum(b.value) : r.rawValue;
    const diff = r.rawValue - beforeRaw;
    const m = getMetric(r.id);
    const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
    const change = Number.isFinite(diff)
      ? `${sign}${Math.abs(diff).toFixed(m.decimals)}${m.unitDisplay}`
      : "—";
    const beforeStatus: MetricStatus = Number.isFinite(beforeRaw)
      ? deriveStatus(r.id, beforeRaw)
      : "正常";
    const afterStatus = r.status as MetricStatus;
    let state: string;
    if (afterStatus === "正常" && beforeStatus === "正常") state = "正常";
    else if (RANK[afterStatus] < RANK[beforeStatus]) state = "改善";
    else if (afterStatus === "正常") state = "改善";
    else state = "观察";
    return { id: r.id, name: r.name, value: `${r.value}${r.unit}`, change, state };
  });

  const abnormalAfter = latest.filter((r) => r.status !== "正常").length;
  const improved = afterMetrics.filter((a) => a.state === "改善").length;
  let result: string;
  let recovery: string;
  let conclusion: string;
  if (abnormalAfter === 0) {
    result = "效果良好";
    recovery = "异常已解除";
    conclusion = "水质指标已恢复至正常范围";
  } else if (improved > 0) {
    result = "效果一般";
    recovery = "持续观察";
    conclusion = "部分指标改善，仍需持续观察";
  } else {
    result = "需要观察";
    recovery = "持续观察";
    conclusion = "指标未明显改善，需继续跟踪";
  }

  updateMonitoring(db, id, {
    status: "已完成",
    result,
    conclusion,
    recovery,
    afterMetrics,
    measuredAt: now,
  });

  const updated = getMonitoringById(db, id);
  if (!updated) throw new ApiError(500, "监测收尾后回读失败");
  return updated;
}
