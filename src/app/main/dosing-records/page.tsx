"use client";

import { useState } from "react";
import { SystemNavigation } from "@/app/components/SystemNavigation";
import { PageHeader } from "@/app/components/PageHeader";
import { StatCard } from "@/app/components/StatCard";
import { ChipButton } from "@/app/components/ChipButton";
import { usePersistentState } from "@/app/components/usePersistentState";
import { useApiData } from "@/app/components/useApiData";
import { DEMO_REFRESH_MS, useData } from "@/app/components/DataContext";
import { apiSend } from "@/app/lib/apiClient";
import { dosingRecords as dosingRecordsMock, type DosingRecord } from "@/app/data/dosingRecords";
import { POOLS } from "@/app/data/pools";
import { dosingBadgeClass as badgeClass, dosingToneClass as toneClass } from "@/app/data/statusStyles";

export default function DosingRecordsPage() {
  const { dataSource, demoRunning } = useData();
  const live = dataSource === "live";
  // 接后端 /api/dosing-records（后端在时含模拟器/新增投放）；不可达时回退内置台账。
  const { data: dosingRecords, reload: reloadDosing } = useApiData<DosingRecord[]>("/dosing-records", dosingRecordsMock, {
    refreshInterval: live ? 15_000 : demoRunning ? DEMO_REFRESH_MS : 0,
  });
  const pools = POOLS;
  const agents = Array.from(new Set(dosingRecords.map((record) => record.agent)));

  const [selectedPoolId, setSelectedPoolId] = usePersistentState("jack-dosing-records-pool", "all");
  const [selectedAgent, setSelectedAgent] = usePersistentState("jack-dosing-records-agent", "all");

  // C7：投放新增——仅 live 模式，POST /api/dosing-records（服务端写投放记录并同建「正在监测」任务），
  // 成功后失效缓存重取；demo 不渲染此表单，与 A 阶段只读台账完全一致。
  const [formPoolId, setFormPoolId] = useState(POOLS[0]?.id ?? "pool-1");
  const [formAgent, setFormAgent] = useState("");
  const [formDosage, setFormDosage] = useState("");
  const [formOperator, setFormOperator] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submitDosing = () => {
    const agent = formAgent.trim();
    const operator = formOperator.trim();
    if (!agent || !operator || submitting) return;
    setSubmitting(true);
    void apiSend("/dosing-records", "POST", {
      poolId: formPoolId,
      agent,
      dosage: formDosage.trim() || undefined,
      operator,
    })
      .then(() => {
        reloadDosing();
        setFormAgent("");
        setFormDosage("");
        setFormOperator("");
      })
      .catch(() => {})
      .finally(() => setSubmitting(false));
  };

  const visibleRecords = dosingRecords.filter(
    (record) =>
      (selectedPoolId === "all" || record.poolId === selectedPoolId) &&
      (selectedAgent === "all" || record.agent === selectedAgent),
  );

  const totalCount = dosingRecords.length;
  const todayCount = dosingRecords.filter((record) => record.time.startsWith("今天")).length;
  const poolCount = new Set(dosingRecords.map((record) => record.poolId)).size;
  const attentionCount = dosingRecords.filter((record) =>
    ["本次未投放", "效果一般", "观察中"].includes(record.result),
  ).length;

  return (
    <main className="system-page min-h-screen px-5 py-8 text-[#d7e2ea] sm:px-10 sm:py-12">
      <SystemNavigation active="dosing-records" />
      <p className="system-demo-notice">本页为演示投放记录台账，仅记录各育苗池"投了什么"（批次、药剂、浓度、剂量、操作人与结果），不作投放决策用途；筛选条件会保存在此设备。</p>

      <section className="mx-auto max-w-6xl py-6">
        <PageHeader
          title="投放记录"
          subtitle="集中查看各育苗池的诱导剂投放台账，追溯投放时间、药剂、剂量与结果。"
          aside={
            <span className="self-center rounded-xl border border-cyan-300/25 bg-cyan-300/[0.08] px-4 py-3 text-sm font-medium text-cyan-200 lg:absolute lg:bottom-0 lg:right-0">共 {totalCount} 条投放记录</span>
          }
        />

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="投放记录总数" value={totalCount} className="border-cyan-300/30" valueClassName="font-semibold text-cyan-200" />
          <StatCard label="今日投放" value={todayCount} className="border-indigo-300/30" valueClassName="font-semibold text-indigo-200" />
          <StatCard label="涉及育苗池" value={poolCount} className="border-emerald-300/30" valueClassName="font-semibold text-emerald-300" />
          <StatCard label="待观察" value={attentionCount} className="border-amber-300/30" valueClassName="font-semibold text-amber-300" />
        </div>

        {live && (
          <div className="mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.05] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-[#d7e2ea]/55">新增投放</p>
                <h2 className="mt-1 text-xl font-semibold text-[#e0f2fe]">登记一次诱导剂投放</h2>
              </div>
              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-200">写入后端数据库 · 同建监测任务</span>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="text-xs text-[#d7e2ea]/50">育苗池</span>
                <select value={formPoolId} onChange={(event) => setFormPoolId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#08131b] px-3 py-2.5 text-sm text-[#e0f2fe] outline-none focus:border-cyan-300/35">
                  {pools.map((pool) => (<option key={pool.id} value={pool.id}>{pool.name}</option>))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-[#d7e2ea]/50">诱导剂 *</span>
                <input value={formAgent} onChange={(event) => setFormAgent(event.target.value)} placeholder="如：硫酸铜" className="mt-2 w-full rounded-xl border border-white/10 bg-[#08131b] px-3 py-2.5 text-sm text-[#e0f2fe] outline-none placeholder:text-[#d7e2ea]/30 focus:border-cyan-300/35" />
              </label>
              <label className="block">
                <span className="text-xs text-[#d7e2ea]/50">剂量</span>
                <input value={formDosage} onChange={(event) => setFormDosage(event.target.value)} placeholder="如：0.5 mg/L" className="mt-2 w-full rounded-xl border border-white/10 bg-[#08131b] px-3 py-2.5 text-sm text-[#e0f2fe] outline-none placeholder:text-[#d7e2ea]/30 focus:border-cyan-300/35" />
              </label>
              <label className="block">
                <span className="text-xs text-[#d7e2ea]/50">操作人 *</span>
                <input value={formOperator} onChange={(event) => setFormOperator(event.target.value)} placeholder="如：张工" className="mt-2 w-full rounded-xl border border-white/10 bg-[#08131b] px-3 py-2.5 text-sm text-[#e0f2fe] outline-none placeholder:text-[#d7e2ea]/30 focus:border-cyan-300/35" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={submitDosing} disabled={submitting || !formAgent.trim() || !formOperator.trim()} className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-2.5 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-40">{submitting ? "提交中…" : "提交投放记录"}</button>
              <span className="text-xs text-[#d7e2ea]/45">带 * 为必填；提交后自动创建「正在监测」任务。</span>
            </div>
          </div>
        )}

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-[#d7e2ea]/55">投放台账</p>
              <h2 className="mt-1 text-xl font-semibold text-[#e0f2fe]">全部投放记录</h2>
            </div>
            <span className="text-sm text-[#d7e2ea]/55">当前显示 {visibleRecords.length} 条</span>
          </div>

          <div className="mt-5">
            <p className="text-xs text-[#d7e2ea]/45">按育苗池筛选</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ChipButton active={selectedPoolId === "all"} onClick={() => setSelectedPoolId("all")}>全部</ChipButton>
              {pools.map((pool) => (
                <ChipButton key={pool.id} active={selectedPoolId === pool.id} onClick={() => setSelectedPoolId(pool.id)}>{pool.name}</ChipButton>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs text-[#d7e2ea]/45">按诱导剂筛选</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ChipButton active={selectedAgent === "all"} onClick={() => setSelectedAgent("all")}>全部</ChipButton>
              {agents.map((agent) => (
                <ChipButton key={agent} active={selectedAgent === agent} onClick={() => setSelectedAgent(agent)}>{agent}</ChipButton>
              ))}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {visibleRecords.map((record) => (
              <div key={record.id} className="rounded-xl border border-white/10 bg-[#08131b] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong className="text-[#e0f2fe]">{record.agent} · {record.dosage}</strong>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(record.result)}`}>{record.result}</span>
                </div>
                <p className="mt-2 text-sm text-[#d7e2ea]/60">{record.time} · {record.pool}（{record.species}） · {record.concentration}</p>
                <p className="mt-2 text-sm text-[#d7e2ea]/75">批次：{record.batch}；操作人员：{record.operator}</p>
              </div>
            ))}
            {visibleRecords.length === 0 && (
              <p className="rounded-xl border border-white/10 bg-[#08131b] p-6 text-center text-sm text-[#d7e2ea]/55">当前筛选条件下暂无投放记录。</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
