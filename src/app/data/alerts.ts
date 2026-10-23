// ⚠️ 约定：src/app/data/*.ts 同时被「前端打包器(Vite)」与「Node 服务端直接运行 .ts」加载，
//    因此本目录内【禁止使用 `@/` 别名或任何依赖打包器解析的导入】—— Node 解析不到会直接启动失败。
//    需要指标字典时由调用方传入（见 groupAlerts 的 metricIdByName 参数）。

export type AlertRecord = {
  id: string;
  poolId: string;
  pool: string;
  species: string;
  metric: string;
  value: string;
  level: string;
  status: string;
  time: string;
  description: string;
  suggestion: string;
  action: string;
  result: string;
  // 后端持久化的处理备注（alerts.note）。demo 数据源用本地保存的备注，live 用它回读。
  note?: string;
};

// ── 事件组（池 × 指标）：预警中心折叠列表的领域类型 ─────────────────────────────
// server 侧 listAlertGroups 直接 import 本类型，保证前后端逐字段一致（与 AlertRecord 同一约定）。
export interface AlertGroup {
  poolId: string;
  pool: string;
  species: string;
  metricId: string;
  metric: string;
  // 组内最近一次发生的读数与时间（组卡摘要用）。
  latestValue: string;
  latestTime: string;
  // 组内最高等级：只要有一条异常即为「异常」，避免被大量预警记录淹没。
  maxLevel: string;
  count: number;
  firstAt: number;
  lastAt: number;
  statusCounts: Record<string, number>;
}

export const groupKeyOf = (poolId: string, metricId: string): string => `${poolId}|${metricId}`;

// 无后端时的分组回退：口径与后端 listAlertGroups 对齐（组内最高等级 = 有异常即异常）。
// 内置数据只有展示用时间文本、没有数值时间戳，故 firstAt/lastAt 置 0；
// 假定入参已按时间倒序（mock 数组即如此），因此首条即为「最近一次」，组顺序沿用首次出现顺序。
export function groupAlerts(
  records: AlertRecord[],
  metricIdByName: Record<string, string>,
): AlertGroup[] {
  const groups = new Map<string, AlertGroup>();

  for (const record of records) {
    const metricId = metricIdByName[record.metric] ?? record.metric;
    const key = groupKeyOf(record.poolId, metricId);
    let group = groups.get(key);
    if (!group) {
      group = {
        poolId: record.poolId,
        pool: record.pool,
        species: record.species,
        metricId,
        metric: record.metric,
        latestValue: record.value,
        latestTime: record.time,
        maxLevel: record.level,
        count: 0,
        firstAt: 0,
        lastAt: 0,
        statusCounts: { 未处理: 0, 处理中: 0, 观察中: 0, 已关闭: 0 },
      };
      groups.set(key, group);
    }
    group.count += 1;
    group.statusCounts[record.status] = (group.statusCounts[record.status] ?? 0) + 1;
    if (record.level === "异常") group.maxLevel = "异常";
  }

  return [...groups.values()];
}

export const alerts: AlertRecord[] = [
  {
    id: "alert-1",
    poolId: "pool-1",
    pool: "1号育苗池",
    species: "虾夷扇贝",
    metric: "氨氮",
    value: "0.18 mg/L",
    level: "异常",
    status: "未处理",
    time: "今天 18:02",
    description: "氨氮浓度超过正常范围，可能影响幼虫活力与附着变态过程。",
    suggestion:
      "建议立即检查换水频率、残饵与有机物积累情况，并持续观察氨氮变化。",
    action: "检查换水频率、残饵与有机物积累情况",
    result: "持续跟踪氨氮变化",
  },
  {
    id: "alert-2",
    poolId: "pool-1",
    pool: "1号育苗池",
    species: "虾夷扇贝",
    metric: "浊度",
    value: "4.6 NTU",
    level: "预警",
    status: "处理中",
    time: "今天 17:48",
    description: "当前浊度高于建议范围，可能与悬浮颗粒或残饵积累有关。",
    suggestion: "建议检查过滤系统并适当调整换水量。",
    action: "检查过滤系统并适当调整换水量",
    result: "处理中，持续跟踪浊度变化",
  },
  {
    id: "alert-3",
    poolId: "pool-2",
    pool: "2号育苗池",
    species: "栉孔扇贝",
    metric: "溶解氧",
    value: "5.7 mg/L",
    level: "预警",
    status: "观察中",
    time: "今天 16:35",
    description: "溶解氧接近下限，需要关注夜间和高密度条件下的变化。",
    suggestion: "建议检查增氧设备，并提高短期监测频率。",
    action: "检查增氧设备，提高短期监测频率",
    result: "持续观察夜间溶解氧变化",
  },
  {
    id: "alert-4",
    poolId: "pool-3",
    pool: "3号育苗池",
    species: "长牡蛎",
    metric: "水温",
    value: "25.8℃",
    level: "异常",
    status: "未处理",
    time: "今天 15:20",
    description: "水温超过当前育苗阶段建议范围，可能增加幼虫代谢压力。",
    suggestion: "建议检查进水温度、遮光与换水条件。",
    action: "检查进水温度、遮光与换水条件",
    result: "等待现场处理后复核水温",
  },
  {
    id: "alert-5",
    poolId: "pool-4",
    pool: "4号育苗池",
    species: "海湾扇贝",
    metric: "pH",
    value: "8.58",
    level: "预警",
    status: "已关闭",
    time: "昨天 21:16",
    description: "pH曾短时超过正常范围，目前已恢复。",
    suggestion: "已完成换水并持续观察，当前无需进一步处理。",
    action: "完成换水并持续观察",
    result: "指标已恢复正常",
  },
  {
    id: "alert-6",
    poolId: "pool-2",
    pool: "2号育苗池",
    species: "栉孔扇贝",
    metric: "盐度",
    value: "32.6‰",
    level: "预警",
    status: "已关闭",
    time: "昨天 18:42",
    description: "盐度短时偏高，可能与补水或蒸发有关。",
    suggestion: "已调整补水比例，盐度恢复正常。",
    action: "调整补水比例",
    result: "盐度已恢复正常",
  },
];
