"use client";

import { useId, useMemo } from "react";
import { METRIC_LIST } from "@/app/data/metrics";

export type TrendStatus = "正常" | "预警" | "异常" | string;
export type TrendProfile = "monitoring" | "event" | "recovery";

type MetricChartConfig = {
  name: string;
  unit: string;
  min: number;
  max: number;
  normalLow: number;
  normalHigh: number;
  warningLow: number;
  warningHigh: number;
  decimals: number;
};

const metricAliases: Record<string, string> = {
  oxygen: "dissolved-oxygen",
  ammonia: "ammonia-nitrogen",
};

// 由单一数据源 METRICS 派生（保留导出名/类型，4 个调用方 0 改动；阈值不再三处重复）
export const metricChartConfigs: Record<string, MetricChartConfig> = Object.fromEntries(
  METRIC_LIST.map((metric) => [
    metric.id,
    {
      name: metric.name,
      unit: metric.unit,
      min: metric.min,
      max: metric.max,
      normalLow: metric.normalLow,
      normalHigh: metric.normalHigh,
      warningLow: metric.warningLow,
      warningHigh: metric.warningHigh,
      decimals: metric.decimals,
    },
  ]),
);

export const normalizeMetricId = (metricId: string) => metricAliases[metricId] ?? metricId;
export const parseMetricValue = (value: string | number) => typeof value === "number" ? value : Number.parseFloat(value);
// 统一曲线身份：同一「池 + 指标」在任意页面/任意时间范围都得到同一条趋势曲线（需求②）
export const trendSeed = (poolId: string, metricId: string) => `${poolId}-${normalizeMetricId(metricId)}`;

const sampleCounts: Record<string, number> = { "1h": 25, "6h": 37, "24h": 49, "7d": 57, "30d": 61 };
const timeLabels: Record<string, string[]> = {
  "1h": ["60分钟前", "45分钟前", "30分钟前", "15分钟前", "当前"],
  "6h": ["6小时前", "4.5小时前", "3小时前", "1.5小时前", "当前"],
  "24h": ["00:00", "06:00", "12:00", "18:00", "当前"],
  "7d": ["第1天", "第3天", "第5天", "第7天"],
  "30d": ["第1天", "第10天", "第20天", "第30天"],
};

const hashSeed = (source: string) => {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

const seededNoise = (seed: number, index: number) => {
  const value = Math.sin((seed + index * 37.17) * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
};

export function buildTrendSeries({
  metricId,
  currentValue,
  range,
  seed,
  status = "正常",
  profile = "monitoring",
  startValue,
}: {
  metricId: string;
  currentValue: string | number;
  range: string;
  seed: string;
  status?: TrendStatus;
  profile?: TrendProfile;
  startValue?: string | number;
}) {
  const normalizedId = normalizeMetricId(metricId);
  const config = metricChartConfigs[normalizedId] ?? metricChartConfigs.temperature;
  const count = sampleCounts[range] ?? 49;
  const finalValue = Number.isFinite(parseMetricValue(currentValue)) ? parseMetricValue(currentValue) : (config.normalLow + config.normalHigh) / 2;
  const initial = startValue === undefined || !Number.isFinite(parseMetricValue(startValue)) ? finalValue : parseMetricValue(startValue);
  const span = config.max - config.min;
  // range 只决定时间窗与采样点数，不参与序列身份；移除后同池同指标同 range 在各页曲线完全重合
  const seedValue = hashSeed(`${normalizedId}-${seed}-${status}-${profile}`);
  const direction = normalizedId === "dissolved-oxygen" ? -1 : 1;
  const statusStrength = status === "异常" ? 0.16 : status === "预警" ? 0.09 : 0.045;

  const values = Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    const wave = Math.sin(t * Math.PI * (3.2 + (seedValue % 5) * 0.22) + (seedValue % 17) / 4) * span * 0.025;
    const ripple = Math.sin(t * Math.PI * 11 + (seedValue % 11)) * span * 0.009;
    const noise = seededNoise(seedValue, index) * span * 0.012;
    const drift = (t - 0.5) * span * (((seedValue % 9) - 4) / 180);
    let value = finalValue + wave + ripple + noise + drift;

    if (profile === "event") {
      const eventPeak = Math.exp(-Math.pow((t - 0.7) / 0.15, 2));
      value += direction * eventPeak * span * statusStrength;
    } else if (profile === "recovery") {
      value = initial + (finalValue - initial) * (1 - Math.exp(-3.6 * t));
      value += wave * (1 - t * 0.55) + ripple + noise * 0.65;
    }

    return Math.min(config.max, Math.max(config.min, value));
  });
  values[values.length - 1] = Math.min(config.max, Math.max(config.min, finalValue));
  return { config, values };
}

const smoothPath = (points: Array<{ x: number; y: number }>) => {
  if (points.length < 2) return "";
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const before = points[index - 1] ?? previous;
    const after = points[index + 2] ?? point;
    const control1X = previous.x + (point.x - before.x) / 6;
    const control1Y = previous.y + (point.y - before.y) / 6;
    const control2X = point.x - (after.x - previous.x) / 6;
    const control2Y = point.y - (after.y - previous.y) / 6;
    return `${path} C ${control1X.toFixed(2)} ${control1Y.toFixed(2)}, ${control2X.toFixed(2)} ${control2Y.toFixed(2)}, ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }, `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`);
};

export type TrendPoint = { value: number; t?: number; status?: string };

export function TrendLineChart({
  metricId,
  currentValue,
  range,
  seed,
  status = "正常",
  profile = "monitoring",
  startValue,
  className = "",
  points,
}: {
  metricId: string;
  currentValue: string | number;
  range: string;
  seed: string;
  status?: TrendStatus;
  profile?: TrendProfile;
  startValue?: string | number;
  className?: string;
  // C5：真实历史序列（来自 /api/water-quality/history 的 points）。提供时直渲、跳过 buildTrendSeries，
  // 从根上保证「同池同指标同曲线」；无（降级/无后端）时回落到确定性 buildTrendSeries。
  points?: TrendPoint[] | number[];
}) {
  const gradientId = useId().replace(/:/g, "");
  const normalizedId = normalizeMetricId(metricId);
  const { config, values } = useMemo(() => {
    const cfg = metricChartConfigs[normalizedId] ?? metricChartConfigs.temperature;
    if (points && points.length > 0) {
      const vals = points.map((p) => {
        const v = typeof p === "number" ? p : p.value;
        return Math.min(cfg.max, Math.max(cfg.min, v));
      });
      return { config: cfg, values: vals };
    }
    return buildTrendSeries({ metricId, currentValue, range, seed, status, profile, startValue });
  }, [metricId, normalizedId, currentValue, range, seed, status, profile, startValue, points]);
  const width = 800;
  const height = 260;
  const left = 58;
  const right = 18;
  const top = 18;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const scaleY = (value: number) => top + ((config.max - value) / (config.max - config.min)) * plotHeight;
  const screenPoints = values.map((value, index) => ({ x: left + (index / (values.length - 1)) * plotWidth, y: scaleY(value) }));
  const path = smoothPath(screenPoints);
  const areaPath = `${path} L ${screenPoints.at(-1)?.x ?? width - right} ${height - bottom} L ${left} ${height - bottom} Z`;
  const markerColor = status === "异常" ? "#e64b60" : status === "预警" ? "#c18a17" : "#129480";
  const labels = timeLabels[range] ?? timeLabels["24h"];
  const format = (value: number) => value.toFixed(config.decimals);

  return (
    <div className={`trend-line-chart ${className}`} role="img" aria-label={`${config.name}${range}变化曲线，当前值${format(values.at(-1) ?? 0)}${config.unit}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`trend-area-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#079cae" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#079cae" stopOpacity="0.02" />
          </linearGradient>
          <filter id={`trend-glow-${gradientId}`} x="-20%" y="-30%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect x={left} y={scaleY(config.normalHigh)} width={plotWidth} height={Math.max(0, scaleY(config.normalLow) - scaleY(config.normalHigh))} fill="#129480" fillOpacity="0.055" />
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => <line key={ratio} x1={left} x2={width - right} y1={top + plotHeight * ratio} y2={top + plotHeight * ratio} stroke="#079cae" strokeOpacity="0.13" />)}
        <line x1={left} x2={width - right} y1={scaleY(config.warningHigh)} y2={scaleY(config.warningHigh)} stroke="#c18a17" strokeOpacity="0.7" strokeDasharray="7 7" />
        {config.warningLow > config.min && <line x1={left} x2={width - right} y1={scaleY(config.warningLow)} y2={scaleY(config.warningLow)} stroke="#e64b60" strokeOpacity="0.62" strokeDasharray="5 7" />}
        <path d={areaPath} fill={`url(#trend-area-${gradientId})`} />
        <path d={path} fill="none" stroke="#079cae" strokeWidth="3" vectorEffect="non-scaling-stroke"  />
        {screenPoints.filter((_, index) => index % Math.max(1, Math.floor(screenPoints.length / 12)) === 0).map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="2.2" fill="#079cae" opacity="0.72" />)}
        <circle cx={screenPoints.at(-1)?.x} cy={screenPoints.at(-1)?.y} r="5" fill={markerColor} stroke="#FFFFFF" strokeWidth="2" />
        <text x="8" y={top + 4} className="trend-axis-label">{format(config.max)}</text>
        <text x="8" y={top + plotHeight / 2 + 4} className="trend-axis-label">{format((config.max + config.min) / 2)}</text>
        <text x="8" y={height - bottom + 4} className="trend-axis-label">{format(config.min)}</text>
      </svg>
      <div className="trend-time-labels">{labels.map((label) => <span key={label}>{label}</span>)}</div>
      <span className="trend-unit">单位：{config.unit || "pH"}</span>
    </div>
  );
}
