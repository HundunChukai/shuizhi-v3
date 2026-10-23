"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ClipboardList,
  FileText,
  Home,
  LayoutDashboard,
  Waves,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useData } from "@/app/components/DataContext";

type NavigationId =
  | "intro"
  | "dashboard"
  | "alerts"
  | "pools"
  | "dosing-records"
  | "monitoring";

const primaryItems: Array<{
  id: NavigationId;
  label: string;
  title: string;
  href: string;
  icon: LucideIcon;
}> = [
  { id: "intro", label: "产品介绍", title: "贝类育苗水质监测平台 · 产品介绍", href: "/", icon: Home },
  { id: "dashboard", label: "总览", title: "综合驾驶舱", href: "/main", icon: LayoutDashboard },
  { id: "alerts", label: "预警", title: "异常预警中心", href: "/main/alerts", icon: AlertTriangle },
  { id: "pools", label: "育苗池", title: "育苗池管理", href: "/main/pools", icon: Waves },
];

const dosingGroup: {
  label: string;
  title: string;
  icon: LucideIcon;
  children: Array<{ id: NavigationId; label: string; title: string; href: string; icon: LucideIcon }>;
} = {
  label: "投放管理",
  title: "投放管理（投放记录 / 投放后监测）",
  icon: ClipboardList,
  children: [
    { id: "dosing-records", label: "投放记录", title: "投放记录", href: "/main/dosing-records", icon: FileText },
    { id: "monitoring", label: "投放后监测", title: "投放后监测", href: "/main/monitoring", icon: BarChart3 },
  ],
};

export function SystemNavigation({
  active,
  activeAlertCount,
  alertTone,
}: {
  active: NavigationId;
  activeAlertCount?: number;
  alertTone?: "warning" | "abnormal";
}) {
  const { openAlertCount, dataSource, alertTone: contextTone } = useData();
  const badgeCount = activeAlertCount ?? openAlertCount;
  const badgeTone = alertTone ?? contextTone;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const groupRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);

  const GroupIcon = dosingGroup.icon;
  const groupActive = dosingGroup.children.some((child) => child.id === active);

  const updatePos = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
  };
  const openMenu = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    updatePos();
    setOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };
  // 点击只负责「打开/钉住」菜单，不做 toggle 关闭：鼠标悬停进入时 onMouseEnter 已先打开菜单，
  // 若点击再 toggle 会立刻把悬停打开的菜单关掉，表现为「按钮点不动、跳不进下拉里的页面」。
  // 关闭途径：点击外部、Escape、鼠标离开、选中菜单项。
  const handleTriggerClick = () => {
    openMenu();
  };

  useEffect(() => {
    if (!open) return;
    const onScrollResize = () => updatePos();
    const onDocPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      // 下拉面板自身也算「内部」：否则 mousedown 先关菜单会使面板在 click 前卸载，
      // 导致「投放记录/投放后监测」链接点击丢失、无法跳转。
      if (
        groupRef.current?.contains(target) ||
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="system-nav-wrap mx-auto max-w-6xl">
      <Link href="/" className="system-brand" aria-label="贝苗监测首页"><Waves size={32} strokeWidth={1.6} /><span><strong>贝苗监测</strong><small>SHELLFISH MONITORING</small></span></Link>
      <nav className="system-nav" aria-label="系统功能导航">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          const hasAlertBadge = item.id === "alerts" && badgeCount > 0;

          return (
            <Link
              key={item.id}
              href={item.href}
              title={item.title}
              aria-current={isActive ? "page" : undefined}
              className={`system-nav-item ${isActive ? "is-active" : ""}`}
            >
              <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
              {hasAlertBadge && (
                <span
                  className={`system-alert-badge ${
                    badgeTone === "abnormal" ? "is-abnormal" : ""
                  }`}
                >
                  {badgeCount}
                </span>
              )}
            </Link>
          );
        })}

        <div
          className="system-nav-group"
          ref={groupRef}
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
        >
          <button
            type="button"
            ref={triggerRef}
            onClick={handleTriggerClick}
            title={dosingGroup.title}
            aria-expanded={open}
            aria-haspopup="true"
            className={`system-nav-item system-nav-group-trigger ${groupActive ? "is-active" : ""} ${open ? "is-open" : ""}`}
          >
            <GroupIcon aria-hidden="true" size={17} strokeWidth={1.8} />
            <span>{dosingGroup.label}</span>
            <ChevronDown className="system-nav-chevron" aria-hidden="true" size={14} strokeWidth={2} />
          </button>
        </div>
      </nav>
      <span className="system-nav-mode">{dataSource === "live" ? "实时模式" : "演示模式"}</span>

      {open && pos && (
        <div
          className="system-nav-dropdown"
          ref={dropdownRef}
          style={{ top: pos.top, right: pos.right }}
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
        >
          {dosingGroup.children.map((child) => {
            const Icon = child.icon;
            const isActive = child.id === active;
            return (
              <Link
                key={child.id}
                href={child.href}
                title={child.title}
                onClick={() => setOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={`system-nav-dropdown-item ${isActive ? "is-active" : ""}`}
              >
                <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
                <span>{child.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
