"use client";

// L1 事件组层：筛选工具条 + 折叠分组列表 + 「显示更多」。
// 组键 = 育苗池 × 指标：同一问题的多次发生折叠成一张组卡（摘要视图），
// 组卡只展示决策所需信息（最新值、组内最高等级、次数、状态分布），
// 展开后才逐条列出发生记录 —— 这就是把「732 条流水」压成「24 个事件」的关键一层。
import { useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, SlidersHorizontal } from "lucide-react";
import type { AlertGroup, AlertRecord } from "@/app/data/alerts";
import { groupKeyOf } from "@/app/data/alerts";
import { ChipButton } from "@/app/components/ChipButton";

export interface AlertsFilterState {
  status: string;
  poolId: string;
  metricId: string;
  level: string;
  range: string;
}

export const STATUS_FILTERS = ["待处置", "全部", "未处理", "处理中", "观察中", "已关闭"] as const;

const RANGE_OPTIONS: Array<[string, string]> = [
  ["全部", "全部时间"],
  ["24h", "近 24 小时"],
  ["7d", "近 7 天"],
];

const selectClass =
  "rounded-lg border border-white/10 bg-[#08131b] px-2.5 py-2 text-xs font-medium text-[#d7e2ea]/80 outline-none focus:border-cyan-300/40";

function statusTone(status: string): string {
  if (status === "未处理") return "border-rose-300/30 bg-rose-300/10 text-rose-300";
  if (status === "处理中") return "border-cyan-300/30 bg-cyan-300/10 text-cyan-200";
  if (status === "观察中") return "border-amber-300/30 bg-amber-300/10 text-amber-300";
  return "border-emerald-300/30 bg-emerald-300/10 text-emerald-300";
}

export function AlertsGroupList({
  groups,
  totalGroups,
  degraded,
  windowCount,
  onShowMore,
  filters,
  onFilterChange,
  poolOptions,
  metricOptions,
  expandedKeys,
  onToggleExpand,
  selectedKey,
  recordsByGroup,
  onLoadMoreRecords,
  statusCountsOf,
  statusOf,
  matchesStatusFilter,
  selectedAlertId,
  onSelectRecord,
  onOpenDetail,
  onClearFilters,
}: {
  groups: AlertGroup[];
  totalGroups: number;
  degraded: boolean;
  windowCount: number;
  onShowMore: () => void;
  filters: AlertsFilterState;
  onFilterChange: (next: Partial<AlertsFilterState>) => void;
  poolOptions: Array<{ id: string; name: string }>;
  metricOptions: Array<{ id: string; name: string }>;
  expandedKeys: string[];
  onToggleExpand: (key: string) => void;
  selectedKey: string | null;
  recordsByGroup: Record<string, AlertRecord[]>;
  onLoadMoreRecords: (key: string) => void;
  statusCountsOf: (group: AlertGroup) => Record<string, number>;
  statusOf: (record: AlertRecord) => string;
  matchesStatusFilter: (record: AlertRecord) => boolean;
  selectedAlertId: string | null;
  onSelectRecord: (record: AlertRecord) => void;
  onOpenDetail: (key: string) => void;
  onClearFilters: () => void;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const filtersActive = filters.poolId !== "全部" || filters.metricId !== "全部" || filters.level !== "全部" || filters.range !== "全部";
  const visible = groups.slice(0, windowCount);
  // 服务端命中数大于已加载数：说明只加载了前若干组（分页上限），如实说明而不是假装"就这些"。
  const cappedByFetch = groups.length < totalGroups;

  return (
    <aside className="alerts-pane">
      {/* 筛选工具区放在列表滚动区外，始终可用。 */}
      <div className="alerts-filters">
        <div className="alerts-list-heading">
          <h2>事件列表 <span>{totalGroups}</span></h2>
          <button type="button" className="alerts-icon-button" aria-label="筛选事件" aria-expanded={showFilters}
            aria-controls="alerts-advanced-filters" data-active={filtersActive || showFilters}
            onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal size={17} /></button>
        </div>

      <div className="alerts-status-filters">
        {STATUS_FILTERS.map((filter) => (
          <ChipButton
            key={filter}
            active={filters.status === filter}
            onClick={() => onFilterChange({ status: filter })}
            inactiveClassName="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-[#d7e2ea]/65 transition-colors hover:border-cyan-300/30 hover:text-cyan-200"
          >
            {filter}
          </ChipButton>
        ))}
      </div>

      <div id="alerts-advanced-filters" className="alerts-select-filters" hidden={!showFilters}>
        <select
          className={selectClass}
          value={filters.poolId}
          onChange={(event) => onFilterChange({ poolId: event.target.value })}
          aria-label="按育苗池筛选"
        >
          <option value="全部">全部育苗池</option>
          {poolOptions.map((pool) => (
            <option key={pool.id} value={pool.id}>
              {pool.name}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={filters.metricId}
          onChange={(event) => onFilterChange({ metricId: event.target.value })}
          aria-label="按指标筛选"
        >
          <option value="全部">全部指标</option>
          {metricOptions.map((metric) => (
            <option key={metric.id} value={metric.id}>
              {metric.name}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={filters.level}
          onChange={(event) => onFilterChange({ level: event.target.value })}
          aria-label="按等级筛选"
        >
          <option value="全部">全部等级</option>
          <option value="异常">仅异常</option>
          <option value="预警">仅预警</option>
        </select>
        <select
          className={selectClass}
          value={filters.range}
          onChange={(event) => onFilterChange({ range: event.target.value })}
          aria-label="按时间范围筛选"
        >
          {RANGE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="alerts-list-caption"><span>按育苗池 × 指标归类</span><span>{visible.length} / {totalGroups} 组</span></div>
      </div>

      <div className="alerts-list-scroll" tabIndex={0} aria-label="预警事件列表">
      {cappedByFetch && !degraded && (
        <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/[0.07] px-3 py-2 text-[11px] leading-5 text-amber-200">
          命中 {totalGroups} 组，单次最多加载 200 组；请用上方筛选缩小范围以看到其余分组。
        </p>
      )}

      <div className="alerts-group-items">
        {visible.length > 0 ? (
          visible.map((group) => {
            const key = groupKeyOf(group.poolId, group.metricId);
            const expanded = expandedKeys.includes(key);
            const counts = statusCountsOf(group);
            const records = recordsByGroup[key] ?? [];
            // 折叠态是「摘要视图」：只给决策所需的汇总信息，逐条记录仅在展开后渲染。
            const shown = expanded ? records : [];
            const outsideFilter = expanded ? records.filter((record) => !matchesStatusFilter(record)).length : 0;
            const hasMore = records.length > 0 && records.length < group.count;
            const selected = key === selectedKey;

            return (
              <div
                key={key}
                className={
                  selected
                    ? "alerts-group-card is-selected"
                    : "alerts-group-card"
                }
              >
                <div className="alerts-event-row">
                  <button type="button" onClick={() => onOpenDetail(key)} aria-pressed={selected}
                    className="alerts-event-select">
                    <span className={`alerts-event-icon tone-${counts["已关闭"] === group.count ? "muted" : group.maxLevel === "异常" ? "danger" : "warning"}`}>
                      {counts["已关闭"] === group.count ? <CircleCheck size={22} /> : <CircleAlert size={22} />}
                    </span>
                    <span className="alerts-event-copy">
                      <strong>{group.pool} · {group.metric}</strong>
                      <span>{group.latestValue} <em className={`tone-${group.maxLevel === "异常" ? "danger" : "warning"}`}>{group.maxLevel}</em></span>
                      <small>{group.species} · {group.latestTime || "—"}</small>
                    </span>
                  </button>
                  <button type="button" className="alerts-icon-button alerts-expand-button"
                    onClick={() => onToggleExpand(key)} aria-expanded={expanded}
                    aria-label={expanded ? "收起记录" : `展开 ${group.count} 条记录`}>
                    <ChevronDown size={16} className={expanded ? "rotate-180" : ""} />
                  </button>
                </div>
                <div className="alerts-event-footer">
                  <span>发生 {group.count} 次</span>
                  <div>{(["未处理", "处理中", "观察中", "已关闭"] as const)
                    .filter((item) => (counts[item] ?? 0) > 0)
                    .map((item) => <span key={item} className={`alerts-status-badge tone-${item === "未处理" ? "danger" : item === "处理中" ? "cyan" : item === "观察中" ? "warning" : "muted"}`}>{item} {counts[item]}</span>)}</div>
                </div>

                {expanded && shown.length > 0 && (
                  <ul className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-3">
                    {shown.map((record) => {
                      const currentStatus = statusOf(record);
                      return (
                        <li key={record.id}>
                          <button
                            type="button"
                            onClick={() => onSelectRecord(record)}
                            aria-pressed={record.id === selectedAlertId}
                            className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                              record.id === selectedAlertId
                                ? "bg-cyan-300/[0.12]"
                                : "hover:bg-white/[0.04]"
                            }`}
                          >
                            <span className="w-28 shrink-0 text-[#d7e2ea]/50">{record.time}</span>
                            <span className="min-w-16 font-medium text-[#e0f2fe]">{record.value}</span>
                            <span className={`rounded-full border px-2 py-0.5 ${statusTone(record.level === "异常" ? "未处理" : "观察中")}`}>
                              {record.level}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 ${statusTone(currentStatus)}`}>
                              {currentStatus}
                            </span>
                            {record.result && <span className="text-[#d7e2ea]/45">{record.result}</span>}
                          </button>
                        </li>
                      );
                    })}
                    {/* 事件组按「完整历史」展示，因此可能包含当前状态/时间筛选范围外的记录：如实说明，避免误读为筛选失效。 */}
                    {outsideFilter > 0 && (
                      <li className="px-2.5 py-1 text-[11px] leading-5 text-[#d7e2ea]/45">
                        该事件组共 {group.count} 次发生，其中 {outsideFilter} 条不在当前状态筛选范围内（事件组按完整历史展示）。
                      </li>
                    )}
                    {hasMore && (
                      <li className="pt-1">
                        <button
                          type="button"
                          onClick={() => onLoadMoreRecords(key)}
                          className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] font-medium text-cyan-300 transition-colors hover:border-cyan-300/30 hover:text-cyan-200"
                        >
                          加载更多记录（已显示 {records.length} / 共 {group.count} 次）
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
            <p className="text-sm text-[#d7e2ea]/50">当前筛选条件下没有事件组。</p>
            {/* 筛选条件会持久化，重新进入页面时可能落在空结果上 —— 给一个一键逃生出口 */}
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-3 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-300/15"
            >
              恢复默认筛选（待处置）
            </button>
          </div>
        )}
      </div>

      {groups.length > visible.length && (
        <button
          type="button"
          onClick={onShowMore}
          className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-[#d7e2ea]/75 transition-colors hover:border-cyan-300/30 hover:text-cyan-200"
        >
          显示更多事件组（还有 {groups.length - visible.length} 组）
        </button>
      )}
      </div>
    </aside>
  );
}
