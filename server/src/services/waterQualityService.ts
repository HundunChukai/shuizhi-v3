// 水质服务：把时序仓储的行映射为前端可直接消费的结构。
//   latestForPool  → MetricReading[]（额外带 recordedAt/rawValue/scenario），对齐前端 resolveReadings 输出；
//   historyForChart→ {config, points:[{t,value,status,...}], meta}，直供 TrendLineChart（C5 直渲真实序列）。
import type { Database } from "../db/driver.ts";
import {
  METRIC_ORDER,
  getMetric,
  makeReading,
  normalizeMetricId,
  deriveStatus,
  type MetricReading,
  type MetricStatus,
} from "../../../src/app/data/metrics.ts";
import {
  latestPerMetric,
  history as repoHistory,
  type HistoryQuery,
  type LatestReading,
} from "../repositories/waterQualityRepo.ts";

export interface LatestView extends MetricReading {
  recordedAt: number;
  rawValue: number;
  scenario: string;
}

export interface ChartConfig {
  name: string;
  unit: string;
  min: number;
  max: number;
  normalLow: number;
  normalHigh: number;
  warningLow: number;
  warningHigh: number;
  decimals: number;
}

// 与前端 TrendLineChart 的 metricChartConfigs 同构（字段名一致），供直渲时对齐坐标轴/阈值线。
export function chartConfig(metricId: string): ChartConfig {
  const m = getMetric(metricId);
  return {
    name: m.name,
    unit: m.unit,
    min: m.min,
    max: m.max,
    normalLow: m.normalLow,
    normalHigh: m.normalHigh,
    warningLow: m.warningLow,
    warningHigh: m.warningHigh,
    decimals: m.decimals,
  };
}

export function latestForPool(db: Database, poolId: string): LatestView[] {
  const readings = latestPerMetric(db, poolId);
  const byMetric = new Map<string, LatestReading>();
  for (const r of readings) byMetric.set(normalizeMetricId(r.metricId), r);
  const out: LatestView[] = [];
  for (const id of METRIC_ORDER) {
    const r = byMetric.get(id);
    if (!r) continue;
    const m = getMetric(id);
    const valueStr = r.value.toFixed(m.decimals);
    out.push({
      ...makeReading(id, valueStr, r.status as MetricStatus),
      recordedAt: r.recordedAt,
      rawValue: r.value,
      scenario: r.scenario,
    });
  }
  return out;
}

export interface HistoryPointView {
  t: number;
  value: number;
  status: MetricStatus;
  min?: number;
  max?: number;
}

export interface HistoryView {
  config: ChartConfig;
  points: HistoryPointView[];
  meta: {
    range: string;
    downsampled: boolean;
    rawCount: number;
    count: number;
    nextCursor: number | null;
  };
}

export function historyForChart(db: Database, q: HistoryQuery, now = Date.now()): HistoryView {
  const res = repoHistory(db, q, now);
  const metricId = normalizeMetricId(q.metricId);
  const m = getMetric(metricId);
  const points: HistoryPointView[] = res.points.map((p) => {
    const point: HistoryPointView = {
      t: p.t,
      value: Number(p.value.toFixed(m.decimals)),
      status: deriveStatus(metricId, p.value),
    };
    if (p.min !== undefined) point.min = Number(p.min.toFixed(m.decimals));
    if (p.max !== undefined) point.max = Number(p.max.toFixed(m.decimals));
    return point;
  });
  return {
    config: chartConfig(metricId),
    points,
    meta: {
      range: res.range,
      downsampled: res.downsampled,
      rawCount: res.rawCount,
      count: points.length,
      nextCursor: res.nextCursor,
    },
  };
}
