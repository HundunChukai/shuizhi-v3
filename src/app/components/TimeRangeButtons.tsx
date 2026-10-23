import { chipClass } from "@/app/data/statusStyles";

// 时间范围 / 指标 / Tab 切换按钮行（main / pools / alerts / monitoring 共用）。
// 激活态复用 statusStyles.chipClass(true)，未激活态为无 hover 变体，逐字照抄现有 class 串。
const INACTIVE_CLASS =
  "rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-[#d7e2ea]/65";

export function TimeRangeButtons({
  options,
  value,
  onChange,
  className = "flex flex-wrap gap-2",
}: {
  options: Array<[string, string]>;
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className={value === id ? chipClass(true) : INACTIVE_CLASS}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
