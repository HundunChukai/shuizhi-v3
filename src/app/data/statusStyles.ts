// 状态 → Tailwind class 单一映射源（合并 C3：alerts / pools / monitoring / dosing-records 各自的同名函数）。
// 纯函数、零依赖、逐字保留各页现有 class 串，A4 接线后各页徽章配色与现状完全一致。
// 说明：pools 版 toneClass/badgeClass 为通用版（效果一般→amber）；dosing 版单独保留（效果一般→rose），二者语义不同不可合并。

// ── 通用（育苗池状态 / 池详情 Tab 徽章）────────────────────────────
// 正常·已关闭·效果良好 → emerald；异常·未处理·本次未投放 → rose；其余（预警·处理中·观察中·效果一般…）→ amber
export const toneClass = (status: string) =>
  status === "正常" || status === "已关闭" || status === "效果良好"
    ? "text-emerald-300"
    : status === "异常" || status === "未处理" || status === "本次未投放"
      ? "text-rose-300"
      : "text-amber-300";

export const badgeClass = (status: string) =>
  `${toneClass(status)} border ${
    status === "正常" || status === "已关闭" || status === "效果良好"
      ? "border-emerald-300/30 bg-emerald-300/10"
      : status === "异常" || status === "未处理" || status === "本次未投放"
        ? "border-rose-300/30 bg-rose-300/10"
        : "border-amber-300/30 bg-amber-300/10"
  }`;

// 通用筛选 chip（激活/未激活），dosing-records 等页共用
export const chipClass = (isActive: boolean) =>
  isActive
    ? "rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-medium text-cyan-200"
    : "rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-[#d7e2ea]/65 transition-colors hover:border-cyan-300/25";

// ── 异常预警中心（处理状态四态）───────────────────────────────
export const alertStatusClass = (status: string) =>
  status === "未处理"
    ? "border-rose-300/30 bg-rose-300/10 text-rose-300"
    : status === "处理中"
      ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-200"
      : status === "观察中"
        ? "border-amber-300/30 bg-amber-300/10 text-amber-300"
        : "border-emerald-300/30 bg-emerald-300/10 text-emerald-300";

// ── 投放后监测（效果 / 指标变化状态 / 恢复文案 / 恢复色）──────────────
export const monitoringResultClass = (result: string) =>
  result === "效果良好"
    ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-300"
    : "border-amber-300/30 bg-amber-300/10 text-amber-300";

export const monitoringStateClass = (state: string) =>
  state === "改善"
    ? "text-emerald-300"
    : state === "观察"
      ? "text-amber-300"
      : state === "异常"
        ? "text-rose-300"
        : "text-cyan-200";

export const monitoringRecoveryStatus = (state: string) =>
  state === "正常"
    ? "已恢复"
    : state === "改善"
      ? "已改善"
      : state === "观察"
        ? "持续观察"
        : "尚未解除";

export const monitoringRecoveryClass = (state: string) =>
  state === "正常" || state === "改善"
    ? "text-emerald-300"
    : state === "观察"
      ? "text-amber-300"
      : "text-rose-300";

// ── 投放记录（效果良好→emerald；本次未投放·效果一般→rose；其余→amber）──────
// 与通用 toneClass 的差异：dosing 将「效果一般」判为 rose（通用版为 amber），故单独保留。
export const dosingToneClass = (result: string) =>
  result === "效果良好"
    ? "text-emerald-300"
    : result === "本次未投放" || result === "效果一般"
      ? "text-rose-300"
      : "text-amber-300";

export const dosingBadgeClass = (result: string) =>
  `${dosingToneClass(result)} border ${
    result === "效果良好"
      ? "border-emerald-300/30 bg-emerald-300/10"
      : result === "本次未投放" || result === "效果一般"
        ? "border-rose-300/30 bg-rose-300/10"
        : "border-amber-300/30 bg-amber-300/10"
  }`;
