// 水质指标单一数据源：ID、单位、阈值、仪表盘配置、状态判定、状态色。
// 前端（仪表盘刻度 / 趋势图阈值 / 状态徽章）与后端（seed / 模拟器 / 告警判定）共用此文件。
// 统一 6 个指标 ID，废弃 oxygen/ammonia 短别名（仅保留 normalizeMetricId 兼容旧演示数据）。

export type MetricStatus = "正常" | "预警" | "异常";

export type GaugeZone = { from: number; to: number; color: string };

export type GaugeConfig = {
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
  zones: GaugeZone[];
};

export type MetricDefinition = {
  id: string;
  name: string;
  unit: string; // 图表用干净单位，如 "mg/L"
  unitDisplay: string; // 数值后展示用单位，保留原有空格，如 " mg/L"
  decimals: number;
  normalRange: string; // 正常范围展示文案
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
  normalLow: number;
  normalHigh: number;
  warningLow: number;
  warningHigh: number;
  zones: GaugeZone[];
};

export type MetricReading = {
  id: string;
  name: string;
  unit: string; // = unitDisplay
  normalRange: string;
  value: string; // 原始数值字符串，如 "7.4"
  status: MetricStatus;
};

export const METRIC_ORDER = [
  "temperature",
  "ph",
  "dissolved-oxygen",
  "salinity",
  "turbidity",
  "ammonia-nitrogen",
] as const;

export const METRICS: Record<string, MetricDefinition> = {
  temperature: {
    id: "temperature",
    name: "水温",
    unit: "℃",
    unitDisplay: "℃",
    decimals: 1,
    normalRange: "20.0–24.0℃",
    min: 18,
    max: 28,
    minLabel: "18",
    maxLabel: "28",
    normalLow: 20,
    normalHigh: 24,
    warningLow: 19,
    warningHigh: 25,
    zones: [
      { from: 18, to: 19, color: "#FF0000" },
      { from: 19, to: 20, color: "#FFD400" },
      { from: 20, to: 24, color: "#00E676" },
      { from: 24, to: 25, color: "#FFD400" },
      { from: 25, to: 28, color: "#FF0000" },
    ],
  },
  ph: {
    id: "ph",
    name: "pH",
    unit: "",
    unitDisplay: "",
    decimals: 2,
    normalRange: "7.80–8.50",
    min: 7,
    max: 9,
    minLabel: "7",
    maxLabel: "9",
    normalLow: 7.8,
    normalHigh: 8.5,
    warningLow: 7.5,
    warningHigh: 8.6,
    zones: [
      { from: 7, to: 7.5, color: "#FF0000" },
      { from: 7.5, to: 7.8, color: "#FFD400" },
      { from: 7.8, to: 8.5, color: "#00E676" },
      { from: 8.5, to: 8.6, color: "#FFD400" },
      { from: 8.6, to: 9, color: "#FF0000" },
    ],
  },
  "dissolved-oxygen": {
    id: "dissolved-oxygen",
    name: "溶解氧",
    unit: "mg/L",
    unitDisplay: " mg/L",
    decimals: 1,
    normalRange: "6.0–9.0 mg/L",
    min: 3,
    max: 10,
    minLabel: "3",
    maxLabel: "10",
    normalLow: 6,
    normalHigh: 9,
    warningLow: 5,
    warningHigh: 9.5,
    zones: [
      { from: 3, to: 5, color: "#FF0000" },
      { from: 5, to: 6, color: "#FFD400" },
      { from: 6, to: 9, color: "#00E676" },
      { from: 9, to: 9.5, color: "#FFD400" },
      { from: 9.5, to: 10, color: "#FF0000" },
    ],
  },
  salinity: {
    id: "salinity",
    name: "盐度",
    unit: "‰",
    unitDisplay: "‰",
    decimals: 1,
    normalRange: "28.0–32.0‰",
    min: 24,
    max: 36,
    minLabel: "24",
    maxLabel: "36",
    normalLow: 28,
    normalHigh: 32,
    warningLow: 26,
    warningHigh: 32.5,
    zones: [
      { from: 24, to: 26, color: "#FF0000" },
      { from: 26, to: 28, color: "#FFD400" },
      { from: 28, to: 32, color: "#00E676" },
      { from: 32, to: 32.5, color: "#FFD400" },
      { from: 32.5, to: 36, color: "#FF0000" },
    ],
  },
  turbidity: {
    id: "turbidity",
    name: "浊度",
    unit: "NTU",
    unitDisplay: " NTU",
    decimals: 1,
    normalRange: "0–4.0 NTU",
    min: 0,
    max: 8,
    minLabel: "0",
    maxLabel: "8",
    normalLow: 0,
    normalHigh: 4,
    warningLow: 0,
    warningHigh: 5.5,
    zones: [
      { from: 0, to: 4, color: "#00E676" },
      { from: 4, to: 5.5, color: "#FFD400" },
      { from: 5.5, to: 8, color: "#FF0000" },
    ],
  },
  "ammonia-nitrogen": {
    id: "ammonia-nitrogen",
    name: "氨氮",
    unit: "mg/L",
    unitDisplay: " mg/L",
    decimals: 2,
    normalRange: "0–0.10 mg/L",
    min: 0,
    max: 0.25,
    minLabel: "0",
    maxLabel: "0.25",
    normalLow: 0,
    normalHigh: 0.1,
    warningLow: 0,
    warningHigh: 0.15,
    zones: [
      { from: 0, to: 0.1, color: "#00E676" },
      { from: 0.1, to: 0.15, color: "#FFD400" },
      { from: 0.15, to: 0.25, color: "#FF0000" },
    ],
  },
};

export const METRIC_LIST: MetricDefinition[] = METRIC_ORDER.map((id) => METRICS[id]);

// 兼容旧演示数据里的短 ID（monitoringTasks / 旧 pools 指标）
const metricAliases: Record<string, string> = {
  oxygen: "dissolved-oxygen",
  ammonia: "ammonia-nitrogen",
};

export const normalizeMetricId = (metricId: string) => metricAliases[metricId] ?? metricId;

export const getMetric = (metricId: string): MetricDefinition =>
  METRICS[normalizeMetricId(metricId)] ?? METRICS.temperature;

export const parseMetricValue = (value: string | number) =>
  typeof value === "number" ? value : Number.parseFloat(value);

// 由阈值单一口径判定状态：正常带内含→正常；预警带内含→预警；否则异常。
export const deriveStatus = (metricId: string, value: string | number): MetricStatus => {
  const metric = getMetric(metricId);
  const numeric = parseMetricValue(value);
  if (!Number.isFinite(numeric)) return "正常";
  if (numeric >= metric.normalLow && numeric <= metric.normalHigh) return "正常";
  if (numeric >= metric.warningLow && numeric <= metric.warningHigh) return "预警";
  return "异常";
};

export const STATUS_COLORS: Record<MetricStatus, string> = {
  正常: "#00E676",
  预警: "#FFD400",
  异常: "#FF0000",
};

// 仪表盘配置由 METRICS 派生（供驾驶舱 MetricGauge 直接引用，保持组件体不变）
export const gaugeConfigs: Record<string, GaugeConfig> = Object.fromEntries(
  METRIC_LIST.map((metric) => [
    metric.id,
    {
      min: metric.min,
      max: metric.max,
      minLabel: metric.minLabel,
      maxLabel: metric.maxLabel,
      zones: metric.zones,
    },
  ]),
);

export const statusColors: Partial<Record<MetricStatus, string>> = STATUS_COLORS;

export const makeReading = (
  metricId: string,
  value: string,
  status?: MetricStatus,
): MetricReading => {
  const metric = getMetric(metricId);
  return {
    id: metric.id,
    name: metric.name,
    unit: metric.unitDisplay,
    normalRange: metric.normalRange,
    value,
    status: status ?? deriveStatus(metric.id, value),
  };
};

export type ReadingSummary = {
  normalCount: number;
  warningCount: number;
  abnormalCount: number;
  worst: MetricReading | null;
  tone: "normal" | "warning" | "abnormal";
};

// 由一组读数实时统计（驾驶舱异常摘要 / 全局角标的数据源，杜绝硬编码）
export const summarizeReadings = (readings: MetricReading[]): ReadingSummary => {
  const normalCount = readings.filter((item) => item.status === "正常").length;
  const warningCount = readings.filter((item) => item.status === "预警").length;
  const abnormalCount = readings.filter((item) => item.status === "异常").length;
  const worst =
    readings.find((item) => item.status === "异常") ??
    readings.find((item) => item.status === "预警") ??
    null;
  const tone = abnormalCount > 0 ? "abnormal" : warningCount > 0 ? "warning" : "normal";
  return { normalCount, warningCount, abnormalCount, worst, tone };
};
