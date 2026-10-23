import type { ReactNode } from "react";
import { chipClass } from "@/app/data/statusStyles";

// 通用筛选/切换 chip（dosing-records 筛选、alerts 筛选、monitoring 分类共用）。
// 默认沿用 statusStyles.chipClass（激活/未激活），需要不同 hover 或尺寸时用 activeClassName/inactiveClassName 覆盖。
export function ChipButton({
  active,
  onClick,
  children,
  activeClassName = chipClass(true),
  inactiveClassName = chipClass(false),
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  activeClassName?: string;
  inactiveClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={active ? activeClassName : inactiveClassName}
    >
      {children}
    </button>
  );
}
