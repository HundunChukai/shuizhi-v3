"use client";

import { CircleAlert, CircleCheck, Clock3, Eye, Siren, Waves } from "lucide-react";
import type { AlertGroup } from "@/app/data/alerts";

const STATUSES = [
  { name: "未处理", icon: CircleAlert, tone: "danger" },
  { name: "处理中", icon: Clock3, tone: "cyan" },
  { name: "观察中", icon: Eye, tone: "warning" },
  { name: "已关闭", icon: CircleCheck, tone: "success" },
] as const;

export function AlertsSummaryBar({ statusCounts, topByStatus, activeFilter, onFilter, groupCount, recordTotal, poolCount }: {
  statusCounts: Record<string, number>;
  topByStatus: Record<string, AlertGroup | null>;
  activeFilter: string;
  onFilter: (filter: string) => void;
  groupCount: number;
  recordTotal: number;
  poolCount: number;
}) {
  const openCount = (statusCounts.未处理 ?? 0) + (statusCounts.处理中 ?? 0) + (statusCounts.观察中 ?? 0);
  return (
    <section className="alerts-summary" aria-label="预警统计">
      <div className="alerts-summary-total">
        <Siren size={30} aria-hidden="true" />
        <div><strong>{openCount}</strong><span>待关注预警</span></div>
      </div>
      <div className="alerts-summary-grid">
        {STATUSES.map(({ name, icon: Icon, tone }) => {
          const top = topByStatus[name];
          const active = activeFilter === name;
          return (
            <button key={name} type="button" className={`alerts-summary-card tone-${tone}`} aria-pressed={active}
              onClick={() => onFilter(active ? "全部" : name)} title={`筛选${name}事件`}>
              <Icon size={23} aria-hidden="true" />
              <div><strong>{statusCounts[name] ?? 0}</strong><span>{name}</span>
                <small title={top ? `最严重：${top.pool} · ${top.metric}` : "暂无记录"}>
                  {top ? `${top.pool} · ${top.metric}` : "暂无记录"}
                </small>
              </div>
            </button>
          );
        })}
      </div>
      <div className="alerts-summary-meta">
        <Waves size={22} aria-hidden="true" />
        <div><p><strong>{poolCount}</strong> 个育苗池 · <strong>{groupCount}</strong> 个事件组</p>
          <p>合计 {recordTotal} 条记录 · 点击状态筛选</p></div>
      </div>
    </section>
  );
}
