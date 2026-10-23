"use client";

import { useEffect } from "react";
import { SystemNavigation } from "@/app/components/SystemNavigation";
import { PageHeader } from "@/app/components/PageHeader";
import { StatCard } from "@/app/components/StatCard";
import { ChipButton } from "@/app/components/ChipButton";
import { TimeRangeButtons } from "@/app/components/TimeRangeButtons";
import { TrendLineChart, trendSeed } from "@/app/components/TrendLineChart";
import { usePersistentState } from "@/app/components/usePersistentState";
import { useApiData } from "@/app/components/useApiData";
import { DEMO_REFRESH_MS, useData } from "@/app/components/DataContext";
import { apiSend } from "@/app/lib/apiClient";
import { monitoringTasks as monitoringTasksMock, type MonitoringTask } from "@/app/data/monitoringTasks";
import {
  monitoringRecoveryClass as recoveryClass,
  monitoringRecoveryStatus as recoveryStatus,
  monitoringResultClass as resultClass,
  monitoringStateClass as stateClass,
} from "@/app/data/statusStyles";

export default function MonitoringPage() {
  const { dataSource, demoRunning } = useData();
  const live = dataSource === "live";
  // 接后端 /api/monitoring（后端在时含投放→监测全链路记录）；不可达时回退内置任务。
  const { data: monitoringTasks, reload: reloadMonitoring } = useApiData<MonitoringTask[]>("/monitoring", monitoringTasksMock, {
    refreshInterval: live ? 15_000 : demoRunning ? DEMO_REFRESH_MS : 0,
  });
  const [selectedCategory, setSelectedCategory] = usePersistentState("jack-monitoring-category", "正在监测");
  const [selectedTaskId, setSelectedTaskId] = usePersistentState("jack-monitoring-task", "monitor-1");
  const [selectedTrendMetricId, setSelectedTrendMetricId] = usePersistentState("jack-monitoring-metric", "ammonia");
  const [selectedTrendRange, setSelectedTrendRange] = usePersistentState("jack-monitoring-range", "24h");
  useEffect(() => {
    const query = window.location.hash.split("?")[1] ?? "";
    const taskId = new URLSearchParams(query).get("task");
    if (!taskId) return;
    const task = monitoringTasks.find((item) => item.id === taskId);
    if (!task) return;
    setSelectedCategory(task.status === "正在监测" ? "正在监测" : "最近完成");
    setSelectedTaskId(task.id);
  }, [setSelectedCategory, setSelectedTaskId]);
  const activeTaskCount = monitoringTasks.filter((task) => task.status === "正在监测").length;
  const completedTodayCount = monitoringTasks.filter((task) => task.status === "已完成" && task.startTime.startsWith("今天")).length;
  const goodResultCount = monitoringTasks.filter((task) => task.result === "效果良好").length;
  const watchResultCount = monitoringTasks.filter((task) => task.result === "需要观察" || task.result === "观察中").length;
  const visibleTasks = monitoringTasks.filter((task) =>
    selectedCategory === "正在监测"
      ? task.status === "正在监测"
      : task.status === "已完成",
  );
  const selectedTask =
    visibleTasks.find((task) => task.id === selectedTaskId) ?? visibleTasks[0];
  const selectedAfterMetric = selectedTask?.afterMetrics.find((metric) => metric.id === selectedTrendMetricId) ?? selectedTask?.afterMetrics[0];
  const selectedBeforeMetric = selectedTask?.beforeMetrics.find((metric) => metric.id === selectedAfterMetric?.id);

  const setCategory = (category: string) => {
    setSelectedCategory(category);
    const nextTasks = monitoringTasks.filter((task) =>
      category === "正在监测"
        ? task.status === "正在监测"
        : task.status === "已完成",
    );

    if (nextTasks[0]) {
      setSelectedTaskId(nextTasks[0].id);
    }
  };

  // C7：监测收尾——仅 live 模式，POST /monitoring/:id/close（服务端采集最新读数为 after_metrics、
  // 算 change/state/recovery/result/conclusion 并归档），成功后失效缓存重取；demo 保持只读与 A 阶段一致。
  const closeTask = (taskId: string) => {
    void apiSend(`/monitoring/${taskId}/close`, "POST")
      .then(() => reloadMonitoring())
      .catch(() => {});
  };

  return (
    <main className="system-page min-h-screen px-5 py-8 text-[#d7e2ea] sm:px-10 sm:py-12">
      <SystemNavigation active="monitoring" />
      <p className="system-demo-notice">本页曲线为根据育苗池、指标、任务和时间范围生成的确定性演示序列，末端值与当前监测值一致。</p>

      <section className="mx-auto max-w-6xl py-6">
        <PageHeader
          title="投放后监测"
          subtitle="持续跟踪诱导剂投放后的水质变化、异常解除情况与育苗效果。"
          aside={
            <div className="self-center rounded-xl border border-cyan-300/25 bg-cyan-300/[0.08] px-4 py-3 text-sm font-medium text-cyan-200 lg:absolute lg:bottom-0 lg:right-0">当前有 {activeTaskCount} 项任务正在监测</div>
          }
        />

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="正在监测" value={activeTaskCount} className="border-cyan-300/30" valueClassName="font-semibold text-cyan-200" />
          <StatCard label="今日完成" value={completedTodayCount} className="border-indigo-300/30" valueClassName="font-semibold text-indigo-200" />
          <StatCard label="效果良好" value={goodResultCount} className="border-emerald-300/30" valueClassName="font-semibold text-emerald-300" />
          <StatCard label="需要观察" value={watchResultCount} className="border-amber-300/30" valueClassName="font-semibold text-amber-300" />
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.55fr)]">
          <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm text-[#d7e2ea]/55">任务列表</p>
            <h2 className="mt-1 text-xl font-semibold text-[#e0f2fe]">投放监测任务</h2>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {["正在监测", "最近完成"].map((category) => (
                <ChipButton key={category} active={selectedCategory === category} onClick={() => setCategory(category)} activeClassName="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2.5 text-sm font-medium text-cyan-200" inactiveClassName="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-medium text-[#d7e2ea]/65 transition-colors hover:border-cyan-300/30">{category}</ChipButton>
              ))}
            </div>
            <div className="mt-5 space-y-3">
              {visibleTasks.map((task) => (
                <button key={task.id} type="button" onClick={() => setSelectedTaskId(task.id)} aria-pressed={task.id === selectedTask?.id} className={task.id === selectedTask?.id ? "w-full rounded-xl border border-cyan-300/35 bg-cyan-300/[0.08] p-4 text-left ring-1 ring-inset ring-cyan-300/20" : "w-full rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:border-cyan-300/25"}>
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#e0f2fe]">{task.pool}</p><p className="mt-1 text-sm text-[#d7e2ea]/55">{task.species}</p></div><span className="text-xs text-[#d7e2ea]/45">{task.startTime}</span></div>
                  <p className="mt-4 text-lg font-semibold text-[#e0f2fe]">{task.agent}</p><p className="mt-1 text-sm text-[#d7e2ea]/60">{task.concentration}</p>
                  <div className="mt-4 flex flex-wrap gap-2"><span className={task.status === "正在监测" ? "rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-200" : "rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-xs font-medium text-emerald-300"}>{task.status}</span><span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${resultClass(task.result)}`}>{task.result}</span></div>
                </button>
              ))}
            </div>
          </aside>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            {selectedTask && (
              <>
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div><p className="text-sm text-[#d7e2ea]/55">当前任务详情</p><h2 className="mt-2 text-2xl font-semibold text-[#e0f2fe]">{selectedTask.pool} · {selectedTask.agent}</h2><p className="mt-2 text-sm text-[#d7e2ea]/60">{selectedTask.species} · 开始于 {selectedTask.startTime}</p></div>
                  <div className="flex flex-wrap gap-2"><span className={selectedTask.status === "正在监测" ? "rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-cyan-200" : "rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-xs font-medium text-emerald-300"}>{selectedTask.status}</span><span className={`rounded-full border px-3 py-1.5 text-xs font-medium ${resultClass(selectedTask.result)}`}>{selectedTask.result}</span></div>
                </div>
                {live && selectedTask.status === "正在监测" && (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3">
                    <p className="text-sm text-[#d7e2ea]/70">完成本次投放后监测：服务端采集最新读数、计算变化与效果评价并归档。</p>
                    <button type="button" onClick={() => closeTask(selectedTask.id)} className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-300/15">完成监测</button>
                  </div>
                )}
                <div className="mt-6 grid gap-4 sm:grid-cols-3"><div className="rounded-xl border border-white/10 bg-[#08131b] p-4"><span className="text-sm text-[#d7e2ea]/55">使用浓度</span><strong className="mt-2 block text-lg text-[#e0f2fe]">{selectedTask.concentration}</strong></div><div className="rounded-xl border border-white/10 bg-[#08131b] p-4"><span className="text-sm text-[#d7e2ea]/55">实际剂量</span><strong className="mt-2 block text-lg text-[#e0f2fe]">{selectedTask.dosage}</strong></div><div className="rounded-xl border border-white/10 bg-[#08131b] p-4"><span className="text-sm text-[#d7e2ea]/55">诱导剂</span><strong className="mt-2 block text-lg text-[#e0f2fe]">{selectedTask.agent}</strong></div></div>
                <p className="mt-5 rounded-xl border border-white/10 bg-[#08131b] p-4 text-sm leading-7 text-[#d7e2ea]/65">{selectedTask.description}</p>

                <div className="mt-8" data-tour="compare"><p className="text-sm text-[#d7e2ea]/55">水质变化</p><h3 className="mt-1 text-xl font-semibold text-[#e0f2fe]">投放前后水质对比</h3><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{selectedTask.afterMetrics.map((metric) => { const beforeMetric = selectedTask.beforeMetrics.find((item) => item.id === metric.id); return (<div key={metric.id} className="rounded-xl border border-white/10 bg-[#08131b] p-4"><div className="flex items-center justify-between gap-3"><span className="font-medium text-[#e0f2fe]">{metric.name}</span><span className={`text-xs font-medium ${stateClass(metric.state)}`}>{metric.state}</span></div><div className="mt-4 flex items-end gap-2 text-sm"><div><span className="block text-[#d7e2ea]/45">投放前</span><strong className="mt-1 block text-[#d7e2ea]/70">{beforeMetric?.value}</strong></div><span className="pb-0.5 text-cyan-300">→</span><div><span className="block text-[#d7e2ea]/45">投放后</span><strong className="mt-1 block text-[#e0f2fe]">{metric.value}</strong></div></div><p className={`mt-4 text-sm font-medium ${stateClass(metric.state)}`}>变化 {metric.change}</p></div>); })}</div></div>

                <div className="mt-8 rounded-xl border border-white/10 bg-[#08131b] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><p className="text-sm text-[#d7e2ea]/55">趋势展示</p><h3 className="mt-1 font-semibold text-[#e0f2fe]">{selectedAfterMetric?.name}投放后变化趋势</h3></div>
                    <TimeRangeButtons options={[["1h", "最近1小时"], ["6h", "最近6小时"], ["24h", "最近24小时"]]} value={selectedTrendRange} onChange={setSelectedTrendRange} />
                  </div>
                  <TimeRangeButtons className="mt-4 flex flex-wrap gap-2" options={selectedTask.afterMetrics.map((metric) => [metric.id, metric.name] as [string, string])} value={selectedTrendMetricId} onChange={setSelectedTrendMetricId} />
                  {selectedAfterMetric && <TrendLineChart className="mt-5" metricId={selectedAfterMetric.id} currentValue={selectedAfterMetric.value} startValue={selectedBeforeMetric?.value} range={selectedTrendRange} seed={trendSeed(selectedTask.poolId, selectedAfterMetric.id)} status={selectedAfterMetric.state === "观察" ? "预警" : "正常"} profile="recovery" />}
                  <div className="mt-4 flex flex-wrap gap-4 text-xs text-[#d7e2ea]/55"><span>青色曲线：投放后监测值</span><span>黄色虚线：预警参考</span><span>红色虚线：异常参考</span></div>
                </div>

                <div className="mt-8 grid gap-5 lg:grid-cols-2"><div className="rounded-xl border border-white/10 bg-[#08131b] p-5"><p className="text-sm text-[#d7e2ea]/55">异常解除情况</p><h3 className="mt-1 font-semibold text-[#e0f2fe]">指标恢复进度</h3><div className="mt-5 space-y-3">{selectedTask.afterMetrics.map((metric) => <div key={metric.id} className="flex items-center justify-between gap-4 border-b border-white/[0.06] pb-3 last:border-0 last:pb-0"><span className="text-sm text-[#d7e2ea]/70">{metric.name}</span><span className={`text-sm font-medium ${recoveryClass(metric.state)}`}>{recoveryStatus(metric.state)}</span></div>)}</div></div><div className="rounded-xl border border-white/10 bg-[#08131b] p-5"><p className="text-sm text-[#d7e2ea]/55">综合效果评价</p><h3 className={`mt-2 text-2xl font-semibold ${selectedTask.result === "效果良好" ? "text-emerald-300" : "text-amber-300"}`}>{selectedTask.result}</h3><p className="mt-5 text-sm leading-7 text-[#d7e2ea]/65">系统评价仅用于辅助决策，最终投放效果应结合幼虫附着率、变态率及现场观察综合判断。</p></div></div>

                <div className="mt-8"><p className="text-sm text-[#d7e2ea]/55">过程记录</p><h3 className="mt-1 font-semibold text-[#e0f2fe]">监测时间线</h3><div className="mt-5 space-y-5 border-l border-white/10 pl-5"><div className="relative"><span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-cyan-300"></span><p className="text-xs text-[#d7e2ea]/45">投放前30分钟</p><p className="mt-1 font-medium text-[#e0f2fe]">投放前环境检查完成</p><p className="mt-1 text-sm text-[#d7e2ea]/60">已确认六项水质指标与育苗池运行条件。</p></div><div className="relative"><span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-cyan-300"></span><p className="text-xs text-[#d7e2ea]/45">投放时</p><p className="mt-1 font-medium text-[#e0f2fe]">工作人员确认诱导剂与剂量</p><p className="mt-1 text-sm text-[#d7e2ea]/60">按任务方案完成药剂与浓度复核。</p></div><div className="relative"><span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-amber-300"></span><p className="text-xs text-[#d7e2ea]/45">投放后1小时</p><p className="mt-1 font-medium text-[#e0f2fe]">诱导剂投放完成</p><p className="mt-1 text-sm text-[#d7e2ea]/60">开始记录投放后的水质与幼虫反应。</p></div><div className="relative"><span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-amber-300"></span><p className="text-xs text-[#d7e2ea]/45">投放后6小时</p><p className="mt-1 font-medium text-[#e0f2fe]">开始投放后连续监测</p><p className="mt-1 text-sm text-[#d7e2ea]/60">持续采集水质变化并评估异常解除进度。</p></div><div className="relative"><span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-emerald-300"></span><p className="text-xs text-[#d7e2ea]/45">当前</p><p className="mt-1 font-medium text-[#e0f2fe]">当前效果评价生成</p><p className="mt-1 text-sm text-[#d7e2ea]/60">当前评价为：{selectedTask.result}。</p></div>{selectedTask.status === "已完成" && <div className="relative"><span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-emerald-300"></span><p className="text-xs text-[#d7e2ea]/45">当前</p><p className="mt-1 font-medium text-[#e0f2fe]">本次监测任务已完成</p><p className="mt-1 text-sm text-[#d7e2ea]/60">已归档本次投放后的监测结果，供后续育苗决策参考。</p></div>}</div></div>
              </>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
