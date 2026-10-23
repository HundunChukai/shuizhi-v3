"use client";

import { useState } from "react";
import { SystemNavigation } from "@/app/components/SystemNavigation";
import { PageHeader } from "@/app/components/PageHeader";
import { StatCard } from "@/app/components/StatCard";
import { TimeRangeButtons } from "@/app/components/TimeRangeButtons";
import { buildTrendSeries, TrendLineChart, trendSeed } from "@/app/components/TrendLineChart";
import { usePersistentState } from "@/app/components/usePersistentState";
import { useApiData } from "@/app/components/useApiData";
import { DEMO_REFRESH_MS, useData } from "@/app/components/DataContext";
import type { HistoryResponse } from "@/app/lib/apiTypes";
import { alerts as alertsMock, type AlertRecord } from "@/app/data/alerts";
import { monitoringTasks as monitoringTasksMock, type MonitoringTask } from "@/app/data/monitoringTasks";
import { dosingRecords as dosingRecordsMock, type DosingRecord } from "@/app/data/dosingRecords";
import { METRIC_LIST, METRIC_ORDER, normalizeMetricId, type MetricReading } from "@/app/data/metrics";
import { POOLS, resolveReadings, type Pool } from "@/app/data/pools";
import { badgeClass, toneClass } from "@/app/data/statusStyles";
import Link from "next/link";

export default function PoolsPage() {
  const { dataSource, alertStatuses, demoRunning } = useData();
  const live = dataSource === "live";
  // 自动演示运行中 demo 模式也轮询后端（池状态/台账随模拟器与业务闭环变化）。
  const refresh = live ? 15_000 : demoRunning ? DEMO_REFRESH_MS : 0;
  const tabs = ["水质历史", "异常与处理", "投放记录", "投放后监测"];
  const metricTabs = METRIC_ORDER;
  const metricNames: Record<string, string> = Object.fromEntries(METRIC_LIST.map((metric) => [metric.id, metric.name]));

  const [selectedPoolId, setSelectedPoolId] = usePersistentState("jack-pools-selected", "pool-1");
  const [selectedHistoryTab, setSelectedHistoryTab] = usePersistentState("jack-pools-history-tab", "水质历史");
  const [selectedMetricId, setSelectedMetricId] = usePersistentState("jack-pools-metric", "temperature");
  const [selectedRange, setSelectedRange] = usePersistentState("jack-pools-range", "24h");
  const [exportMessage, setExportMessage] = useState("");

  // 接后端：池列表 / 预警 / 投放 / 监测（列表类，多页共享缓存）；不可达即回退内置数据。
  const pools = useApiData<Pool[]>("/pools", POOLS, { refreshInterval: refresh }).data;
  const alerts = useApiData<AlertRecord[]>("/alerts", alertsMock, { refreshInterval: refresh }).data;
  const monitoringTasks = useApiData<MonitoringTask[]>("/monitoring", monitoringTasksMock, { refreshInterval: refresh }).data;
  const dosingRecords = useApiData<DosingRecord[]>("/dosing-records", dosingRecordsMock, { refreshInterval: refresh }).data;

  const selectedPool = pools.find((pool) => pool.id === selectedPoolId) ?? pools[0];
  // 当前 6 指标读数：接 /api/water-quality/latest，回退本地场景读数。
  const poolReadings = useApiData<MetricReading[]>(`/water-quality/latest?poolId=${selectedPool.id}`, resolveReadings(selectedPool.id, "normal"), { refreshInterval: refresh }).data;
  const poolStatusCounts = pools.reduce<Record<string, number>>((counts, pool) => { counts[pool.status] = (counts[pool.status] ?? 0) + 1; return counts; }, {});
  const poolAlertRecords = alerts.filter((alert) => alert.poolId === selectedPool.id).map((alert) => ({ id: alert.id, time: alert.time, metric: alert.metric, level: alert.level, value: alert.value, status: alertStatuses[alert.id] ?? alert.status, action: alert.action, result: alert.result }));
  const poolMonitoringRecords = monitoringTasks.filter((task) => task.poolId === selectedPool.id).map((task) => ({ taskId: task.id, time: task.startTime, agent: task.agent, duration: task.duration, conclusion: task.conclusion, recovery: task.recovery, result: task.result, status: task.status }));
  const poolDosingRecords = dosingRecords.filter((record) => record.poolId === selectedPool.id);
  const selectedMetric = poolReadings.find((metric) => metric.id === normalizeMetricId(selectedMetricId)) ?? poolReadings[0];
  const selectPool = (id: string) => { setSelectedPoolId(id); setExportMessage(""); };
  // 历史曲线：接 /api/water-quality/history（真实序列直渲 TrendLineChart），回退确定性演示序列。
  const { data: history } = useApiData<HistoryResponse | null>(`/water-quality/history?poolId=${selectedPool.id}&metricId=${selectedMetric.id}&range=${selectedRange}`, null, { refreshInterval: refresh });
  const historyTrend = buildTrendSeries({ metricId: selectedMetric.id, currentValue: selectedMetric.value, range: "24h", seed: trendSeed(selectedPool.id, selectedMetric.id), status: selectedMetric.status });
  const historyIndexes = [historyTrend.values.length - 1, historyTrend.values.length - 5, historyTrend.values.length - 9, historyTrend.values.length - 13, historyTrend.values.length - 21, 0];
  const historySamples = historyIndexes.map((sampleIndex) => {
    const numericValue = historyTrend.values[Math.max(0, sampleIndex)];
    const status = numericValue >= historyTrend.config.normalLow && numericValue <= historyTrend.config.normalHigh ? "正常" : numericValue >= historyTrend.config.warningLow && numericValue <= historyTrend.config.warningHigh ? "预警" : "异常";
    return { value: `${numericValue.toFixed(historyTrend.config.decimals)}${historyTrend.config.unit}`, status };
  });
  const exportPoolReport = () => {
    const rows = [
      ["育苗池", selectedPool.name],
      ["苗种", selectedPool.species],
      ["批次", selectedPool.batch],
      ["运行状态", selectedPool.status],
      [],
      ["指标", "当前数值", "状态"],
      ...poolReadings.map((metric) => [metric.name, `${metric.value}${metric.unit}`, metric.status]),
      [],
      ["历史时间", selectedMetric.name, "状态"],
      ...["当前", "2小时前", "4小时前", "6小时前", "10小时前", "12小时前"].map((time, index) => [time, historySamples[index].value, historySamples[index].status]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedPool.name}-${selectedPool.batch}-监测报告.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExportMessage(`已生成并下载${selectedPool.name}的演示监测报告。`);
  };

  return <main className="system-page min-h-screen px-5 py-8 text-[#d7e2ea] sm:px-10 sm:py-12">
    <SystemNavigation active="pools" />
    <p className="system-demo-notice">本页使用确定性的演示育苗池与历史监测数据；当前筛选会保存在此设备，并可导出当前育苗池的演示监测报告。</p>
    <section className="mx-auto max-w-6xl py-6">
      <PageHeader title="育苗池管理" subtitle="查看各育苗池的基础信息、当前水质状态与完整历史记录。" aside={<span className="self-center rounded-xl border border-cyan-300/25 bg-cyan-300/[0.08] px-4 py-3 text-sm font-medium text-cyan-200 lg:absolute lg:bottom-0 lg:right-0">支持查看与导出</span>} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="育苗池总数" value={pools.length} className="border-cyan-300/30" valueClassName="text-cyan-200" /><StatCard label="正常运行" value={poolStatusCounts["正常"] ?? 0} className="border-emerald-300/30" valueClassName="text-emerald-300" /><StatCard label="存在预警" value={poolStatusCounts["预警"] ?? 0} className="border-amber-300/30" valueClassName="text-amber-300" /><StatCard label="存在异常" value={poolStatusCounts["异常"] ?? 0} className="border-rose-300/30" valueClassName="text-rose-300" /></div>
      <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.55fr)]"><aside className="space-y-6"><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="text-sm text-[#d7e2ea]/55">育苗池列表</p><h2 className="mt-1 text-xl font-semibold text-[#e0f2fe]">选择育苗池</h2><div className="mt-5 space-y-3">{pools.map(pool => <button key={pool.id} type="button" onClick={() => selectPool(pool.id)} aria-pressed={pool.id === selectedPool.id} className={pool.id === selectedPool.id ? "w-full rounded-xl border border-cyan-300/35 bg-cyan-300/[0.08] p-4 text-left ring-1 ring-inset ring-cyan-300/20" : "w-full rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:border-cyan-300/25"}><div className="flex justify-between gap-3"><div><p className="font-semibold text-[#e0f2fe]">{pool.name}</p><p className="mt-1 text-sm text-[#d7e2ea]/55">{pool.species}</p></div><span className={`text-xs font-medium ${toneClass(pool.status)}`}>{pool.status}</span></div><p className="mt-3 text-sm text-[#d7e2ea]/65">{pool.batch} · {pool.stage}</p><p className="mt-2 text-xs text-[#d7e2ea]/45">负责人：{pool.manager}</p></button>)}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="text-sm text-[#d7e2ea]/55">育苗池信息</p><h2 className="mt-1 text-xl font-semibold text-[#e0f2fe]">{selectedPool.name}</h2><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-[#d7e2ea]/45">苗种</dt><dd className="mt-1 text-[#e0f2fe]">{selectedPool.species}</dd></div><div><dt className="text-[#d7e2ea]/45">批次编号</dt><dd className="mt-1 text-[#e0f2fe]">{selectedPool.batch}</dd></div><div><dt className="text-[#d7e2ea]/45">生长阶段</dt><dd className="mt-1 text-[#e0f2fe]">{selectedPool.stage}</dd></div><div><dt className="text-[#d7e2ea]/45">投苗日期</dt><dd className="mt-1 text-[#e0f2fe]">{selectedPool.startDate}</dd></div><div><dt className="text-[#d7e2ea]/45">当前密度</dt><dd className="mt-1 text-[#e0f2fe]">{selectedPool.density}</dd></div><div><dt className="text-[#d7e2ea]/45">水体体积</dt><dd className="mt-1 text-[#e0f2fe]">{selectedPool.waterVolume}</dd></div><div><dt className="text-[#d7e2ea]/45">负责人</dt><dd className="mt-1 text-[#e0f2fe]">{selectedPool.manager}</dd></div><div><dt className="text-[#d7e2ea]/45">运行状态</dt><dd className={`mt-1 font-medium ${toneClass(selectedPool.status)}`}>{selectedPool.status}</dd></div></dl><p className="mt-5 border-t border-white/[0.06] pt-4 text-sm leading-7 text-[#d7e2ea]/65">{selectedPool.description}</p></div></aside>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-[#d7e2ea]/55">实时概览</p><h2 className="mt-1 text-xl font-semibold text-[#e0f2fe]">当前水质状态</h2></div><span className={`rounded-full px-3 py-1.5 text-xs font-medium ${badgeClass(selectedPool.status)}`}>{selectedPool.status}</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{poolReadings.map(metric => <div key={metric.id} className="rounded-xl border border-white/10 bg-[#08131b] p-4"><span className="text-sm text-[#d7e2ea]/55">{metric.name}</span><strong className="mt-2 block text-2xl text-[#e0f2fe]">{metric.value}{metric.unit}</strong><span className={`mt-3 inline-block text-sm font-medium ${toneClass(metric.status)}`}>{metric.status}</span></div>)}</div>
          <div className="mt-8 border-t border-white/10 pt-6"><div className="flex flex-wrap items-center justify-between gap-4"><TimeRangeButtons options={tabs.map((tab) => [tab, tab] as [string, string])} value={selectedHistoryTab} onChange={setSelectedHistoryTab} /><button type="button" onClick={exportPoolReport} className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-sm font-medium text-cyan-200">导出育苗池报告</button></div>{exportMessage && <p className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-sm text-cyan-100">{exportMessage}</p>}
            {selectedHistoryTab === "水质历史" && (
              <div className="mt-6">
                <TimeRangeButtons options={metricTabs.map((id) => [id, metricNames[id]] as [string, string])} value={selectedMetricId} onChange={setSelectedMetricId} />
                <TimeRangeButtons className="mt-3 flex flex-wrap gap-2" options={[["24h", "最近24小时"], ["7d", "最近7天"], ["30d", "最近30天"]]} value={selectedRange} onChange={setSelectedRange} />
                <div className="mt-6 rounded-xl border border-white/10 bg-[#08131b] p-5">
                  <p className="text-sm text-[#d7e2ea]/55">{selectedPool.name} · {selectedMetric.name}</p>
                  <h3 className="mt-1 text-xl font-semibold text-[#e0f2fe]">历史趋势 · 当前值 {selectedMetric.value}{selectedMetric.unit}</h3>
                  <TrendLineChart className="mt-5" metricId={selectedMetric.id} currentValue={selectedMetric.value} range={selectedRange} seed={trendSeed(selectedPool.id, selectedMetric.id)} status={selectedMetric.status} points={history?.points} />
                  <div className="mt-4 flex flex-wrap gap-4 text-xs text-[#d7e2ea]/55"><span>青色曲线：历史监测值</span><span>黄色虚线：预警参考</span><span>红色虚线：异常参考</span></div>
                </div>
                <div className="mt-5 overflow-x-auto"><table className="w-full min-w-130 text-left text-sm"><thead className="text-[#d7e2ea]/45"><tr><th className="pb-3 font-medium">时间</th><th className="pb-3 font-medium">指标</th><th className="pb-3 font-medium">数值</th><th className="pb-3 font-medium">状态</th></tr></thead><tbody>{["当前", "2小时前", "4小时前", "6小时前", "10小时前", "12小时前"].map((time, index) => <tr key={time} className="border-t border-white/[0.06]"><td className="py-3 text-[#d7e2ea]/60">{time}</td><td className="py-3 text-[#e0f2fe]">{selectedMetric.name}</td><td className="py-3 text-[#d7e2ea]/70">{historySamples[index].value}</td><td className={`py-3 font-medium ${toneClass(historySamples[index].status)}`}>{historySamples[index].status}</td></tr>)}</tbody></table></div>
              </div>
            )}
            {selectedHistoryTab === "异常与处理" && <HistoryCards records={poolAlertRecords} kind="alert" badgeClass={badgeClass} />}
            {selectedHistoryTab === "投放记录" && <HistoryCards records={poolDosingRecords} kind="dosing" badgeClass={badgeClass} />}
            {selectedHistoryTab === "投放后监测" && <HistoryCards records={poolMonitoringRecords} kind="monitoring" badgeClass={badgeClass} />}
          </div></section></div>
    </section>
  </main>;
}

function HistoryCards({ records, kind, badgeClass }: { records: Record<string, string>[]; kind: string; badgeClass: (status: string) => string }) {
  return <div className="mt-6 space-y-3">{records.map((record, index) => <div key={`${record.time}-${index}`} className="rounded-xl border border-white/10 bg-[#08131b] p-4">{kind === "alert" ? <><div className="flex flex-wrap items-center justify-between gap-3"><strong className="text-[#e0f2fe]">{record.metric} · {record.value}</strong><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(record.status)}`}>{record.status}</span></div><p className="mt-2 text-sm text-[#d7e2ea]/60">{record.time} · {record.level} · 采取措施：{record.action}</p><p className="mt-2 text-sm text-[#d7e2ea]/75">处理结果：{record.result}</p></> : kind === "dosing" ? <><div className="flex flex-wrap items-center justify-between gap-3"><strong className="text-[#e0f2fe]">{record.agent} · {record.dosage}</strong><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(record.result)}`}>{record.result}</span></div><p className="mt-2 text-sm text-[#d7e2ea]/60">{record.time} · {record.concentration} · 操作人员：{record.operator}</p><p className="mt-2 text-sm text-[#d7e2ea]/75">批次：{record.batch}</p></> : <><div className="flex flex-wrap items-center justify-between gap-3"><strong className="text-[#e0f2fe]">{record.agent} · {record.duration}</strong><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(record.result)}`}>{record.result}</span></div><p className="mt-2 text-sm text-[#d7e2ea]/60">{record.time} · 任务状态：{record.status}</p><p className="mt-2 text-sm text-[#d7e2ea]/75">水质结论：{record.conclusion}；异常解除：{record.recovery}</p><Link href={`/main/monitoring?task=${record.taskId}`} className="mt-3 inline-flex text-sm font-medium text-cyan-200 hover:text-cyan-100">查看投放后监测</Link></>}</div>)}</div>;
}
