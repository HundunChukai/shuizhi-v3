// 前端侧 API 响应视图类型（与 server 各 service 输出对齐）。
// 列表类数据直接复用 src/app/data 的领域类型（AlertRecord / DosingRecord / MonitoringTask / Pool / MetricReading），
// 此处只补充「后端额外附带字段」与「历史曲线」这类前端 data 文件里没有的结构。
import type { MetricReading, MetricStatus } from "@/app/data/metrics";
import type { Pool } from "@/app/data/pools";

// GET /api/water-quality/latest：MetricReading 超集（附带采集时间 / 原始数值 / 场景）。
export interface LatestReadingView extends MetricReading {
  recordedAt: number;
  rawValue: number;
  scenario: string;
}

// 历史曲线图表配置（与 TrendLineChart 的 metricChartConfigs 同构，字段名一致）。
export interface ChartConfigView {
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

export interface HistoryPointView {
  t: number;
  value: number;
  status: MetricStatus;
  min?: number;
  max?: number;
}

// GET /api/water-quality/history：直供 TrendLineChart 的 points。
export interface HistoryResponse {
  config: ChartConfigView;
  points: HistoryPointView[];
  meta: {
    range: string;
    downsampled: boolean;
    rawCount: number;
    count: number;
    nextCursor: number | null;
  };
}

// GET /api/pools：Pool + 未关闭预警数；GET /api/pools/:id 再附带最新 6 指标读数。
export interface PoolWithAlerts extends Pool {
  openAlertCount: number;
  readings?: LatestReadingView[];
}
