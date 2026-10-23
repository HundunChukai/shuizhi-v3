// 育苗池单一数据源：池主数据 + 当前读数(normal) + 场景覆盖(warning/abnormal) + 场景解析。
// 合并原 main/page.tsx 内联 4 池 + poolMetricScenarios 与 pools/page.tsx 的 pools 数组（共四份）。
// 状态一律由 metrics.deriveStatus 计算，杜绝同一读数在不同页面出现不同状态（原 P1-4「24.2 一处正常一处预警」）。
// 后端 seed 复用本文件，保证前后端数据一致。

import {
  METRIC_ORDER,
  METRICS,
  makeReading,
  parseMetricValue,
  type MetricReading,
  type MetricStatus,
} from "./metrics";

export type Pool = {
  id: string;
  name: string;
  species: string;
  batch: string;
  stage: string;
  status: MetricStatus; // 池整体运行状态：正常 / 预警 / 异常
  startDate: string;
  density: string;
  waterVolume: string;
  manager: string;
  description: string;
};

export const POOLS: Pool[] = [
  {
    id: "pool-1",
    name: "1号育苗池",
    species: "虾夷扇贝",
    batch: "2026-XYSB-07",
    stage: "附着变态期",
    status: "正常",
    startDate: "2026-07-02",
    density: "18 个/mL",
    waterVolume: "42 m³",
    manager: "张师傅",
    description: "当前幼虫发育稳定，已进入附着变态观察阶段。",
  },
  {
    id: "pool-2",
    name: "2号育苗池",
    species: "栉孔扇贝",
    batch: "2026-ZKSB-05",
    stage: "壳顶幼虫期",
    status: "预警",
    startDate: "2026-07-04",
    density: "21 个/mL",
    waterVolume: "38 m³",
    manager: "李师傅",
    description: "溶解氧和浊度接近预警范围，正在加强观察。",
  },
  {
    id: "pool-3",
    name: "3号育苗池",
    species: "长牡蛎",
    batch: "2026-CML-03",
    stage: "附着变态期",
    status: "异常",
    startDate: "2026-06-29",
    density: "16 个/mL",
    waterVolume: "45 m³",
    manager: "王师傅",
    description: "多项指标超过正常范围，已进入异常处理流程。",
  },
  {
    id: "pool-4",
    name: "4号育苗池",
    species: "海湾扇贝",
    batch: "2026-HWSB-06",
    stage: "D形幼虫期",
    status: "正常",
    startDate: "2026-07-06",
    density: "20 个/mL",
    waterVolume: "36 m³",
    manager: "赵师傅",
    description: "当前水质与幼虫活动状态稳定，按计划进行常规监测。",
  },
];

export type ScenarioMode = "normal" | "warning" | "abnormal" | "recovery";

type MetricValueMap = Record<string, string>;

// 各池 normal 场景当前读数（原始数值字符串，状态由 deriveStatus 派生；等于原 main 的 normal 场景值）
export const currentReadings: Record<string, MetricValueMap> = {
  "pool-1": {
    temperature: "22.6",
    ph: "8.12",
    "dissolved-oxygen": "7.4",
    salinity: "30.8",
    turbidity: "3.2",
    "ammonia-nitrogen": "0.06",
  },
  "pool-2": {
    temperature: "24.2",
    ph: "8.36",
    "dissolved-oxygen": "5.7",
    salinity: "31.4",
    turbidity: "4.6",
    "ammonia-nitrogen": "0.10",
  },
  "pool-3": {
    temperature: "25.8",
    ph: "8.72",
    "dissolved-oxygen": "4.6",
    salinity: "33.4",
    turbidity: "6.8",
    "ammonia-nitrogen": "0.18",
  },
  "pool-4": {
    temperature: "22.8",
    ph: "8.16",
    "dissolved-oxygen": "7.3",
    salinity: "30.8",
    turbidity: "3.0",
    "ammonia-nitrogen": "0.05",
  },
};

// 各池 warning / abnormal 场景读数覆盖（取自原 main poolMetricScenarios）
export const scenarioOverrides: Record<
  string,
  Record<"warning" | "abnormal", MetricValueMap>
> = {
  "pool-1": {
    warning: {
      temperature: "24.1",
      ph: "8.34",
      "dissolved-oxygen": "5.9",
      salinity: "31.5",
      turbidity: "4.5",
      "ammonia-nitrogen": "0.11",
    },
    abnormal: {
      temperature: "25.4",
      ph: "8.63",
      "dissolved-oxygen": "4.8",
      salinity: "33.0",
      turbidity: "6.5",
      "ammonia-nitrogen": "0.17",
    },
  },
  "pool-2": {
    warning: {
      temperature: "24.7",
      ph: "8.42",
      "dissolved-oxygen": "5.4",
      salinity: "31.8",
      turbidity: "5.0",
      "ammonia-nitrogen": "0.13",
    },
    abnormal: {
      temperature: "25.2",
      ph: "8.61",
      "dissolved-oxygen": "4.8",
      salinity: "32.8",
      turbidity: "6.2",
      "ammonia-nitrogen": "0.17",
    },
  },
  "pool-3": {
    warning: {
      temperature: "25.0",
      ph: "8.56",
      "dissolved-oxygen": "5.3",
      salinity: "32.4",
      turbidity: "5.4",
      "ammonia-nitrogen": "0.14",
    },
    abnormal: {
      temperature: "26.2",
      ph: "8.79",
      "dissolved-oxygen": "4.2",
      salinity: "34.0",
      turbidity: "7.3",
      "ammonia-nitrogen": "0.21",
    },
  },
  "pool-4": {
    warning: {
      temperature: "23.8",
      ph: "8.29",
      "dissolved-oxygen": "6.1",
      salinity: "31.3",
      turbidity: "4.3",
      "ammonia-nitrogen": "0.09",
    },
    abnormal: {
      temperature: "25.0",
      ph: "8.60",
      "dissolved-oxygen": "4.9",
      salinity: "32.9",
      turbidity: "6.1",
      "ammonia-nitrogen": "0.16",
    },
  },
};

// recovery（异常恢复）场景：由 abnormal→normal 插值派生，不新增手写数据。
// factor 0.35 表示已从异常值向正常值回归 65%（更接近正常），体现「恢复中」语义。
const RECOVERY_FACTOR = 0.35;

export const getPool = (poolId: string): Pool =>
  POOLS.find((pool) => pool.id === poolId) ?? POOLS[0];

// 解析某池在某场景下的 6 项指标读数（状态由 deriveStatus 统一计算）
export const resolveReadings = (
  poolId: string,
  mode: ScenarioMode,
): MetricReading[] => {
  const normal = currentReadings[poolId] ?? currentReadings["pool-1"];
  const overrides = scenarioOverrides[poolId];
  return METRIC_ORDER.map((metricId) => {
    const metric = METRICS[metricId];
    const normalValue = normal[metricId];
    let value: string;
    if (mode === "warning" || mode === "abnormal") {
      value = overrides?.[mode]?.[metricId] ?? normalValue;
    } else if (mode === "recovery") {
      const abnormalValue = parseMetricValue(
        overrides?.abnormal?.[metricId] ?? normalValue,
      );
      const base = parseMetricValue(normalValue);
      value = (base + (abnormalValue - base) * RECOVERY_FACTOR).toFixed(
        metric.decimals,
      );
    } else {
      value = normalValue;
    }
    return makeReading(metricId, value);
  });
};
