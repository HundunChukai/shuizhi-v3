// 传感器数据接入服务（C8 骨架 + B8/live 入库口径）。
// 抽象：所有 ingest 适配器（HTTP=POST /api/sensor-data、预留 MQTT/TCP）最终都汇入 ingest()，
//       统一「校验 → 落库 → 阈值判定(alertService) → 更新 sensors.last_seen」，保证单一入库口径。
import type { Database } from "../db/driver.ts";
import {
  METRICS,
  getMetric,
  normalizeMetricId,
  deriveStatus,
  type MetricStatus,
} from "../../../src/app/data/metrics.ts";
import { insertOne, type RecordSource } from "../repositories/waterQualityRepo.ts";
import { findSensor, getSensorById, touchSensor } from "../repositories/sensorsRepo.ts";
import { evaluateReading } from "./alertService.ts";

export interface SensorSample {
  sensorId?: string;
  poolId?: string;
  metricId?: string;
  value: number | string;
  unit?: string;
  recordedAt?: number;
  scenario?: string;
}

export interface IngestItem {
  poolId: string;
  metricId: string;
  value: number;
  status: MetricStatus;
  recordId: number;
  alertCreated: boolean;
  sensorId: string | null;
}

export interface IngestResult {
  accepted: number;
  rejected: number;
  items: IngestItem[];
  errors: string[];
}

// 单条样本入库；非法（缺池/指标、未知指标、非数值）返回 null 并计入 rejected。
function ingestOne(
  db: Database,
  s: SensorSample,
  source: RecordSource,
  now: number,
): { item: IngestItem | null; error?: string } {
  let poolId = s.poolId;
  let metricIdRaw = s.metricId;
  let sensorId: string | null = null;

  // 优先用 sensorId 反查池/指标；否则要求显式 (poolId, metricId)。
  if (s.sensorId) {
    const sensor = getSensorById(db, s.sensorId);
    if (!sensor) return { item: null, error: `未知 sensorId: ${s.sensorId}` };
    poolId = sensor.poolId;
    metricIdRaw = sensor.metricId;
    sensorId = sensor.id;
  }
  if (!poolId || !metricIdRaw) {
    return { item: null, error: "缺少 sensorId 或 (poolId, metricId)" };
  }

  const metricId = normalizeMetricId(metricIdRaw);
  if (!METRICS[metricId]) {
    return { item: null, error: `未知指标: ${metricIdRaw}` };
  }

  const numeric = typeof s.value === "number" ? s.value : Number.parseFloat(String(s.value));
  if (!Number.isFinite(numeric)) {
    return { item: null, error: `非法数值: ${String(s.value)}` };
  }

  const m = getMetric(metricId);
  const value = Number(numeric.toFixed(m.decimals));
  const status = deriveStatus(metricId, value);
  const recordedAt =
    typeof s.recordedAt === "number" && Number.isFinite(s.recordedAt) ? s.recordedAt : now;

  if (!sensorId) {
    sensorId = findSensor(db, poolId, metricId)?.id ?? null;
  }

  const recordId = insertOne(db, {
    poolId,
    sensorId,
    metricId,
    value,
    status,
    scenario: s.scenario ?? "live",
    source,
    recordedAt,
  });

  const evalRes = evaluateReading(db, { poolId, metricId, value, status, recordedAt }, now);
  if (sensorId) touchSensor(db, sensorId, recordedAt);

  return {
    item: { poolId, metricId, value, status, recordId, alertCreated: evalRes.created, sensorId },
  };
}

// 支持单条或批量；逐条独立处理，单条失败不影响其余（返回 accepted/rejected/errors）。
export function ingest(
  db: Database,
  payload: SensorSample | SensorSample[],
  source: RecordSource = "sensor",
  now = Date.now(),
): IngestResult {
  const samples = Array.isArray(payload) ? payload : [payload];
  const result: IngestResult = { accepted: 0, rejected: 0, items: [], errors: [] };
  for (const s of samples) {
    if (!s || typeof s !== "object") {
      result.rejected += 1;
      result.errors.push("样本格式非法");
      continue;
    }
    const { item, error } = ingestOne(db, s, source, now);
    if (item) {
      result.accepted += 1;
      result.items.push(item);
    } else {
      result.rejected += 1;
      if (error) result.errors.push(error);
    }
  }
  return result;
}
