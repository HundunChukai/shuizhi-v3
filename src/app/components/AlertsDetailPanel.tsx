"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Clock3, Droplets, Lightbulb, Save, X } from "lucide-react";
import { TimeRangeButtons } from "@/app/components/TimeRangeButtons";
import { TrendLineChart, trendSeed } from "@/app/components/TrendLineChart";
import type { AlertRecord } from "@/app/data/alerts";

const TABS = [["overview", "事件详情"], ["trend", "历史趋势"], ["timeline", "处理记录"]] as const;
type DetailView = (typeof TABS)[number][0];

export function AlertsDetailPanel({ alert, status, statusOptions, range, onRangeChange, metricIdsByName,
  persistedNote, notes, noteDraft, onNoteDraftChange, onSaveNote, onStatusChange, onClose }: {
  alert: AlertRecord;
  status: string;
  statusOptions: string[];
  range: string;
  onRangeChange: (range: string) => void;
  metricIdsByName: Record<string, string>;
  persistedNote: string;
  notes: Array<{ title: string; description: string }>;
  noteDraft: string;
  onNoteDraftChange: (value: string) => void;
  onSaveNote: () => void;
  onStatusChange: (status: string) => void;
  onClose?: () => void;
}) {
  const [view, setView] = useState<DetailView>("overview");
  const tone = alert.level === "异常" ? "danger" : "warning";
  const statusTone = status === "未处理" ? "danger" : status === "处理中" ? "cyan" : status === "观察中" ? "warning" : "muted";
  const metricId = metricIdsByName[alert.metric] ?? "temperature";

  const trend = (
    <section className="alerts-module alerts-trend-panel">
      <div className="alerts-module-heading">
        <h3>{alert.metric}事件前后变化</h3>
        <TimeRangeButtons options={[["1h", "最近1小时"], ["6h", "最近6小时"], ["24h", "最近24小时"]]}
          value={range} onChange={onRangeChange} className="alerts-trend-ranges" />
      </div>
      <TrendLineChart metricId={metricId} currentValue={alert.value} range={range}
        seed={trendSeed(alert.poolId, metricId)} status={alert.level} profile="event" />
      <div className="alerts-chart-legend">
        <span><i />监测值</span><span><i />预警参考</span><span><i />异常参考</span>
      </div>
    </section>
  );
  const timeline = (
    <section className="alerts-module alerts-timeline-panel">
      <h3>处理时间线</h3>
      <ol className="alerts-event-timeline">
        <li className="is-complete"><span className="alerts-timeline-dot" /><strong>指标触发预警</strong><small>{alert.time}</small></li>
        <li className="is-complete"><span className="alerts-timeline-dot" /><strong>异常记录已创建</strong><small>{alert.time}</small></li>
        <li className={status === "未处理" ? "" : "is-complete"}><span className="alerts-timeline-dot" /><strong>{status === "未处理" ? "等待工作人员处理" : `当前状态：${status}`}</strong><small>当前</small></li>
      </ol>
      <p className="alerts-timeline-description">{alert.metric}指标触发预警规则，已同步至预警中心；可更新处理状态并记录现场处置情况。</p>
    </section>
  );
  const noteForm = (
    <section className="alerts-module alerts-note">
      <div className="alerts-module-heading"><label htmlFor="alert-handling-note">处理备注</label>
        <span>{notes.length + (persistedNote ? 1 : 0)} 条已保存</span></div>
      <textarea id="alert-handling-note" value={noteDraft} onChange={(event) => onNoteDraftChange(event.target.value)}
        placeholder="填写本次采取的处理措施、现场情况或后续观察计划……" />
      <button type="button" className="alerts-primary-button" onClick={onSaveNote} disabled={!noteDraft.trim()}>
        <Save size={15} aria-hidden="true" />保存处理记录
      </button>
    </section>
  );

  return (
    <section className="alerts-detail-panel">
      <header className="alerts-detail-heading">
        <div className="alerts-detail-title">
          <span className={`alerts-detail-icon tone-${tone}`}><CircleAlert size={27} aria-hidden="true" /></span>
          <div><div className="alerts-title-line"><h2>{alert.pool} · {alert.metric}</h2>
            <span className={`alerts-status-badge tone-${statusTone}`}>{status}</span></div>
            <p><span>事件编号 <b>{alert.id}</b></span><span>发生时间 <b>{alert.time}</b></span></p>
          </div>
        </div>
        <div className="alerts-heading-actions">
          <label className="alerts-status-select"><span>处理状态</span>
            <select value={status} onChange={(event) => onStatusChange(event.target.value)} aria-label="更新处理状态">
              {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          {onClose && <button type="button" className="alerts-icon-button alerts-detail-close" aria-label="关闭详情" onClick={onClose}><X size={18} /></button>}
        </div>
      </header>
      <div className="alerts-detail-tabs" role="tablist" aria-label="详情内容">
        {TABS.map(([id, label], index) => (
          <button key={id} type="button" id={`alert-tab-${id}`} role="tab" aria-selected={view === id}
            aria-controls={`alert-panel-${id}`} tabIndex={view === id ? 0 : -1} onClick={() => setView(id)}
            onKeyDown={(event) => {
              const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (!offset && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              const next = event.key === "Home" ? TABS[0][0] : event.key === "End" ? TABS[2][0] : TABS[(index + offset + TABS.length) % TABS.length][0];
              setView(next);
              event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#alert-tab-${next}`)?.focus();
            }}>{label}</button>
        ))}
      </div>
      <div className="alerts-detail-body" role="tabpanel" id={`alert-panel-${view}`} aria-labelledby={`alert-tab-${view}`} tabIndex={0}>
        {view === "overview" && <>
          <div className="alerts-detail-overview">
            <section className={`alerts-reading-card tone-${tone}`}>
              <Droplets size={29} aria-hidden="true" />
              <div><span>{alert.metric} · 当前读数</span><strong>{alert.value}</strong>
                <span className={`alerts-status-badge tone-${tone}`}>预警等级：{alert.level}</span></div>
            </section>
            <section className="alerts-module alerts-description"><h3>异常说明</h3><p>{alert.description}</p>
              <div className="alerts-record-meta"><span>育苗品种 <b>{alert.species}</b></span><span>所属育苗池 <b>{alert.pool}</b></span></div>
            </section>
          </div>
          <div className="alerts-detail-middle">
            {trend}
            <section className="alerts-module alerts-advice">
              <h3><Lightbulb size={19} aria-hidden="true" />系统建议</h3><p>{alert.suggestion}</p>
              <div className="alerts-advice-row"><CircleCheck size={16} aria-hidden="true" /><div><h4>已采取措施</h4><p>{alert.action || "—"}</p></div></div>
              <div className="alerts-advice-row"><Clock3 size={16} aria-hidden="true" /><div><h4>处理结果</h4><p>{alert.result || "—"}</p></div></div>
            </section>
          </div>
          <div className="alerts-detail-bottom">{timeline}{noteForm}</div>
        </>}
        {view === "trend" && <div className="alerts-expanded-trend">{trend}</div>}
        {view === "timeline" && <>
          {timeline}
          <section className="alerts-module alerts-saved-notes"><h3>已保存的处理备注</h3>
            {!persistedNote && notes.length === 0 && <p>暂无处理备注，可在下方记录现场处置情况。</p>}
            {persistedNote && <article><span>已存入数据库</span><h4>处理备注</h4><p>{persistedNote}</p></article>}
            {notes.map((note, index) => <article key={`${note.title}-${index}`}><span>本机记录 {index + 1}</span><h4>{note.title}</h4><p>{note.description}</p></article>)}
          </section>
          {noteForm}
        </>}
      </div>
    </section>
  );
}
