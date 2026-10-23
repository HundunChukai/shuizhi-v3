export type DosingRecord = {
  id: string;
  poolId: string;
  pool: string;
  species: string;
  batch: string;
  time: string;
  agent: string;
  concentration: string;
  dosage: string;
  operator: string;
  result: string;
};

// 全局投放记录台账：仅记录"投了什么"（池·批次·时间·药剂·浓度/剂量·操作人·结果），不含投放建议或决策语义。按时间由近及远排列。
// 育苗池详情页的"投放记录"Tab 与"投放管理 → 投放记录"页共用此数据源。
export const dosingRecords: DosingRecord[] = [
  { id: "dr-1", poolId: "pool-1", pool: "1号育苗池", species: "虾夷扇贝", batch: "2026-XYSB-07", time: "今天 16:30", agent: "肾上腺素", concentration: "10⁻⁴ mol/L", dosage: "2.0 L", operator: "张师傅", result: "效果良好" },
  { id: "dr-2", poolId: "pool-2", pool: "2号育苗池", species: "栉孔扇贝", batch: "2026-ZKSB-05", time: "今天 16:30", agent: "肾上腺素", concentration: "10⁻⁴ mol/L", dosage: "2.0 L", operator: "李师傅", result: "观察中" },
  { id: "dr-3", poolId: "pool-3", pool: "3号育苗池", species: "长牡蛎", batch: "2026-CML-03", time: "今天 16:30", agent: "肾上腺素", concentration: "10⁻⁴ mol/L", dosage: "2.0 L", operator: "王师傅", result: "本次未投放" },
  { id: "dr-4", poolId: "pool-4", pool: "4号育苗池", species: "海湾扇贝", batch: "2026-HWSB-06", time: "今天 16:30", agent: "肾上腺素", concentration: "10⁻⁴ mol/L", dosage: "2.0 L", operator: "赵师傅", result: "效果良好" },
  { id: "dr-5", poolId: "pool-1", pool: "1号育苗池", species: "虾夷扇贝", batch: "2026-XYSB-07", time: "昨天 14:15", agent: "氯化钾", concentration: "18 mmol/L", dosage: "2.1 L", operator: "值班人员", result: "效果良好" },
  { id: "dr-6", poolId: "pool-2", pool: "2号育苗池", species: "栉孔扇贝", batch: "2026-ZKSB-05", time: "昨天 14:15", agent: "氯化钾", concentration: "18 mmol/L", dosage: "2.1 L", operator: "值班人员", result: "效果良好" },
  { id: "dr-7", poolId: "pool-3", pool: "3号育苗池", species: "长牡蛎", batch: "2026-CML-03", time: "昨天 14:15", agent: "氯化钾", concentration: "18 mmol/L", dosage: "2.1 L", operator: "值班人员", result: "效果一般" },
  { id: "dr-8", poolId: "pool-4", pool: "4号育苗池", species: "海湾扇贝", batch: "2026-HWSB-06", time: "昨天 14:15", agent: "氯化钾", concentration: "18 mmol/L", dosage: "2.1 L", operator: "值班人员", result: "效果良好" },
  { id: "dr-9", poolId: "pool-1", pool: "1号育苗池", species: "虾夷扇贝", batch: "2026-XYSB-07", time: "07-08 10:20", agent: "去甲肾上腺素", concentration: "5×10⁻⁵ mol/L", dosage: "1.6 L", operator: "张师傅", result: "效果良好" },
  { id: "dr-10", poolId: "pool-2", pool: "2号育苗池", species: "栉孔扇贝", batch: "2026-ZKSB-05", time: "07-08 10:20", agent: "去甲肾上腺素", concentration: "5×10⁻⁵ mol/L", dosage: "1.6 L", operator: "李师傅", result: "观察中" },
  { id: "dr-11", poolId: "pool-3", pool: "3号育苗池", species: "长牡蛎", batch: "2026-CML-03", time: "07-08 10:20", agent: "去甲肾上腺素", concentration: "5×10⁻⁵ mol/L", dosage: "1.6 L", operator: "王师傅", result: "效果良好" },
  { id: "dr-12", poolId: "pool-4", pool: "4号育苗池", species: "海湾扇贝", batch: "2026-HWSB-06", time: "07-08 10:20", agent: "去甲肾上腺素", concentration: "5×10⁻⁵ mol/L", dosage: "1.6 L", operator: "赵师傅", result: "效果良好" },
];
