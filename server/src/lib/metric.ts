// 指标数值格式化：数字 → 展示字符串（与前端 mock 一致，如 0.18 → "0.18 mg/L"、25.8 → "25.8℃"）。
import { getMetric, normalizeMetricId } from "../../../src/app/data/metrics.ts";

export function formatMetricValue(metricId: string, value: number): string {
  const metric = getMetric(metricId);
  return `${value.toFixed(metric.decimals)}${metric.unitDisplay}`;
}

export function metricName(metricId: string): string {
  return getMetric(metricId).name;
}

export function metricUnit(metricId: string): string {
  return getMetric(metricId).unit;
}

// 指标的「胁迫方向」：值朝哪个方向偏移会恶化。溶解氧偏低为风险，其余指标偏高为风险。
// 与前端 pools.ts 的 scenarioOverrides 方向一致（温度/pH/盐度/浊度/氨氮偏高，溶解氧偏低）。
// 供模拟器目标值计算与预警文案共用，避免各处重复判断。
const LOW_SIDE_STRESS = new Set(["dissolved-oxygen"]);

export function isLowSideStress(metricId: string): boolean {
  return LOW_SIDE_STRESS.has(normalizeMetricId(metricId));
}
