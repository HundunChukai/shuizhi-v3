export type MonitoringMetricBefore = {
  id: string;
  name: string;
  value: string;
};

export type MonitoringMetricAfter = MonitoringMetricBefore & {
  change: string;
  state: string;
};

export type MonitoringTask = {
  id: string;
  poolId: string;
  pool: string;
  species: string;
  agent: string;
  concentration: string;
  dosage: string;
  startTime: string;
  status: string;
  result: string;
  description: string;
  duration: string;
  conclusion: string;
  recovery: string;
  beforeMetrics: MonitoringMetricBefore[];
  afterMetrics: MonitoringMetricAfter[];
};

export const monitoringTasks: MonitoringTask[] = [
  {
    id: "monitor-1",
    poolId: "pool-1",
    pool: "1号育苗池",
    species: "虾夷扇贝",
    agent: "肾上腺素",
    concentration: "10⁻⁴ mol/L",
    dosage: "2.0 L",
    startTime: "今天 16:30",
    status: "正在监测",
    result: "观察中",
    description: "投放后幼虫活动状态稳定，氨氮逐步下降，继续观察附着变态情况。",
    duration: "6小时",
    conclusion: "氨氮逐步下降，幼虫活动状态稳定",
    recovery: "持续观察",
    beforeMetrics: [
      { id: "temperature", name: "水温", value: "22.8℃" },
      { id: "ph", name: "pH", value: "8.10" },
      { id: "oxygen", name: "溶解氧", value: "6.3 mg/L" },
      { id: "salinity", name: "盐度", value: "30.7‰" },
      { id: "turbidity", name: "浊度", value: "4.5 NTU" },
      { id: "ammonia", name: "氨氮", value: "0.14 mg/L" },
    ],
    afterMetrics: [
      { id: "temperature", name: "水温", value: "22.6℃", change: "-0.2℃", state: "正常" },
      { id: "ph", name: "pH", value: "8.12", change: "+0.02", state: "正常" },
      { id: "oxygen", name: "溶解氧", value: "7.1 mg/L", change: "+0.8 mg/L", state: "改善" },
      { id: "salinity", name: "盐度", value: "30.8‰", change: "+0.1‰", state: "正常" },
      { id: "turbidity", name: "浊度", value: "3.8 NTU", change: "-0.7 NTU", state: "改善" },
      { id: "ammonia", name: "氨氮", value: "0.09 mg/L", change: "-0.05 mg/L", state: "改善" },
    ],
  },
  {
    id: "monitor-2",
    poolId: "pool-2",
    pool: "2号育苗池",
    species: "栉孔扇贝",
    agent: "去甲肾上腺素",
    concentration: "5×10⁻⁵ mol/L",
    dosage: "1.6 L",
    startTime: "今天 17:10",
    status: "正在监测",
    result: "需要观察",
    description: "溶解氧有所恢复，但浊度仍接近预警范围，建议继续增氧并观察。",
    duration: "6小时",
    conclusion: "溶解氧有所恢复，浊度仍接近预警范围",
    recovery: "持续观察",
    beforeMetrics: [
      { id: "temperature", name: "水温", value: "23.9℃" },
      { id: "ph", name: "pH", value: "8.36" },
      { id: "oxygen", name: "溶解氧", value: "5.6 mg/L" },
      { id: "salinity", name: "盐度", value: "31.5‰" },
      { id: "turbidity", name: "浊度", value: "4.8 NTU" },
      { id: "ammonia", name: "氨氮", value: "0.11 mg/L" },
    ],
    afterMetrics: [
      { id: "temperature", name: "水温", value: "24.0℃", change: "+0.1℃", state: "正常" },
      { id: "ph", name: "pH", value: "8.34", change: "-0.02", state: "正常" },
      { id: "oxygen", name: "溶解氧", value: "6.2 mg/L", change: "+0.6 mg/L", state: "改善" },
      { id: "salinity", name: "盐度", value: "31.4‰", change: "-0.1‰", state: "正常" },
      { id: "turbidity", name: "浊度", value: "4.3 NTU", change: "-0.5 NTU", state: "观察" },
      { id: "ammonia", name: "氨氮", value: "0.10 mg/L", change: "-0.01 mg/L", state: "观察" },
    ],
  },
  {
    id: "monitor-3",
    poolId: "pool-3",
    pool: "3号育苗池",
    species: "长牡蛎",
    agent: "氯化钾",
    concentration: "20 mmol/L",
    dosage: "2.4 L",
    startTime: "今天 13:20",
    status: "已完成",
    result: "效果良好",
    description: "水质指标稳定，幼虫附着率明显提高，本次监测已完成。",
    duration: "12小时",
    conclusion: "水质指标稳定，幼虫附着率明显提高",
    recovery: "异常已解除",
    beforeMetrics: [
      { id: "temperature", name: "水温", value: "22.4℃" },
      { id: "ph", name: "pH", value: "8.08" },
      { id: "oxygen", name: "溶解氧", value: "6.8 mg/L" },
      { id: "salinity", name: "盐度", value: "30.3‰" },
      { id: "turbidity", name: "浊度", value: "3.9 NTU" },
      { id: "ammonia", name: "氨氮", value: "0.08 mg/L" },
    ],
    afterMetrics: [
      { id: "temperature", name: "水温", value: "22.5℃", change: "+0.1℃", state: "正常" },
      { id: "ph", name: "pH", value: "8.11", change: "+0.03", state: "正常" },
      { id: "oxygen", name: "溶解氧", value: "7.5 mg/L", change: "+0.7 mg/L", state: "改善" },
      { id: "salinity", name: "盐度", value: "30.4‰", change: "+0.1‰", state: "正常" },
      { id: "turbidity", name: "浊度", value: "3.1 NTU", change: "-0.8 NTU", state: "改善" },
      { id: "ammonia", name: "氨氮", value: "0.05 mg/L", change: "-0.03 mg/L", state: "改善" },
    ],
  },
  {
    id: "monitor-4",
    poolId: "pool-4",
    pool: "4号育苗池",
    species: "海湾扇贝",
    agent: "肾上腺素",
    concentration: "8×10⁻⁵ mol/L",
    dosage: "1.8 L",
    startTime: "昨天 19:40",
    status: "已完成",
    result: "效果良好",
    description: "投放后水质稳定，未出现新的异常，附着变态过程正常。",
    duration: "24小时",
    conclusion: "水质稳定，未出现新的异常",
    recovery: "异常已解除",
    beforeMetrics: [
      { id: "temperature", name: "水温", value: "22.9℃" },
      { id: "ph", name: "pH", value: "8.18" },
      { id: "oxygen", name: "溶解氧", value: "6.6 mg/L" },
      { id: "salinity", name: "盐度", value: "30.9‰" },
      { id: "turbidity", name: "浊度", value: "3.7 NTU" },
      { id: "ammonia", name: "氨氮", value: "0.07 mg/L" },
    ],
    afterMetrics: [
      { id: "temperature", name: "水温", value: "22.8℃", change: "-0.1℃", state: "正常" },
      { id: "ph", name: "pH", value: "8.16", change: "-0.02", state: "正常" },
      { id: "oxygen", name: "溶解氧", value: "7.3 mg/L", change: "+0.7 mg/L", state: "改善" },
      { id: "salinity", name: "盐度", value: "30.8‰", change: "-0.1‰", state: "正常" },
      { id: "turbidity", name: "浊度", value: "3.0 NTU", change: "-0.7 NTU", state: "改善" },
      { id: "ammonia", name: "氨氮", value: "0.05 mg/L", change: "-0.02 mg/L", state: "改善" },
    ],
  },
  {
    id: "monitor-5",
    poolId: "pool-1",
    pool: "1号育苗池",
    species: "虾夷扇贝",
    agent: "氯化钾",
    concentration: "18 mmol/L",
    dosage: "2.1 L",
    startTime: "昨天 14:15",
    status: "已完成",
    result: "效果一般",
    description: "水质恢复正常，但附着效果低于预期，建议复核投放时间与幼虫发育阶段。",
    duration: "24小时",
    conclusion: "水质恢复正常，附着效果低于预期",
    recovery: "异常已解除",
    beforeMetrics: [
      { id: "temperature", name: "水温", value: "23.1℃" },
      { id: "ph", name: "pH", value: "8.21" },
      { id: "oxygen", name: "溶解氧", value: "6.1 mg/L" },
      { id: "salinity", name: "盐度", value: "30.6‰" },
      { id: "turbidity", name: "浊度", value: "4.2 NTU" },
      { id: "ammonia", name: "氨氮", value: "0.10 mg/L" },
    ],
    afterMetrics: [
      { id: "temperature", name: "水温", value: "23.0℃", change: "-0.1℃", state: "正常" },
      { id: "ph", name: "pH", value: "8.18", change: "-0.03", state: "正常" },
      { id: "oxygen", name: "溶解氧", value: "6.8 mg/L", change: "+0.7 mg/L", state: "改善" },
      { id: "salinity", name: "盐度", value: "30.7‰", change: "+0.1‰", state: "正常" },
      { id: "turbidity", name: "浊度", value: "3.9 NTU", change: "-0.3 NTU", state: "观察" },
      { id: "ammonia", name: "氨氮", value: "0.08 mg/L", change: "-0.02 mg/L", state: "改善" },
    ],
  },
];
