import type { ReactNode } from "react";

// 四宫格统计卡（alerts / dosing-records / monitoring / pools 共用），逐字照抄现有 class 串。
// className 传边框色（如 border-cyan-300/30），valueClassName 传数值色（如 font-semibold text-cyan-200）。
export function StatCard({
  label,
  value,
  className = "",
  valueClassName = "",
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={`flex min-h-32 flex-col items-center justify-center rounded-2xl border bg-[#06345b]/90 p-5 text-center shadow-lg shadow-slate-950/20 ${className}`}
    >
      <span className="text-sm font-medium text-slate-100">{label}</span>
      <strong className={`mt-3 block text-3xl ${valueClassName}`}>{value}</strong>
    </div>
  );
}
