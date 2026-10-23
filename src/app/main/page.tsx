"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { SystemNavigation } from "@/app/components/SystemNavigation";
import { PageHeader } from "@/app/components/PageHeader";
import { TimeRangeButtons } from "@/app/components/TimeRangeButtons";
import { TrendLineChart, trendSeed } from "@/app/components/TrendLineChart";
import { usePersistentState } from "@/app/components/usePersistentState";
import { useApiData } from "@/app/components/useApiData";
import { DEMO_REFRESH_MS, useData } from "@/app/components/DataContext";
import { ChipButton } from "@/app/components/ChipButton";
import { DataSourceToggle } from "@/app/components/DataSourceToggle";
import { useDemoTour } from "@/app/components/DemoTour";
import { invalidateCache } from "@/app/lib/apiClient";
import type { HistoryResponse } from "@/app/lib/apiTypes";
import {
  gaugeConfigs,
  summarizeReadings,
  type GaugeConfig,
  type MetricReading,
} from "@/app/data/metrics";
import { POOLS, resolveReadings, type ScenarioMode } from "@/app/data/pools";
import { toneClass } from "@/app/data/statusStyles";
import Link from "next/link";
import { Play, Square, Thermometer, Droplets, Waves, FlaskConical, CircleDot, CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";

// C6：监测场景选项（4 个，与后端 simulator SCENARIO_MODES 一致）。激活配色沿用原场景按钮，不新增 CSS。
const SCENARIO_OPTIONS: Array<{ id: ScenarioMode; label: string; activeClass: string }> = [
  { id: "normal", label: "正常运行", activeClass: "rounded-lg border border-emerald-300/35 bg-emerald-300/10 px-4 py-2 text-sm font-medium text-emerald-200" },
  { id: "warning", label: "轻度预警", activeClass: "rounded-lg border border-amber-300/35 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-200" },
  { id: "abnormal", label: "异常事件", activeClass: "rounded-lg border border-rose-300/35 bg-rose-300/10 px-4 py-2 text-sm font-medium text-rose-200" },
  { id: "recovery", label: "异常恢复", activeClass: "rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-200" },
];
const SCENARIO_INACTIVE_CLASS = "rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-[#d7e2ea]/65 transition-colors hover:border-cyan-300/30 hover:text-cyan-200";

const gaugePoint = (value: number, config: GaugeConfig, radius: number) => {
  const ratio = Math.min(1, Math.max(0, (value - config.min) / (config.max - config.min)));
  const radians = ((180 + ratio * 180) * Math.PI) / 180;
  return {
    x: 110 + radius * Math.cos(radians),
    y: 98 + radius * Math.sin(radians),
  };
};

const gaugeArcPath = (from: number, to: number, config: GaugeConfig) => {
  const start = gaugePoint(from, config, 79);
  const end = gaugePoint(to, config, 79);
  const ratio = (to - from) / (config.max - config.min);
  return `M ${start.x} ${start.y} A 79 79 0 ${ratio > 1 ? 1 : 0} 1 ${end.x} ${end.y}`;
};

function MetricGauge({
  metric,
  selected,
  onSelect,
}: {
  metric: MetricReading;
  selected: boolean;
  onSelect: () => void;
}) {
  const config = gaugeConfigs[metric.id];
  const numericValue = Number.parseFloat(metric.value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : config.min;
  const ratio = Math.min(1, Math.max(0, (safeValue - config.min) / (config.max - config.min)));
  const needleAngle = -90 + ratio * 180;
  const pointerColor = "#214f72";
  const MetricIcon = ({ temperature: Thermometer, ph: Droplets, "dissolved-oxygen": Droplets, salinity: Waves, turbidity: CircleDot, "ammonia-nitrogen": FlaskConical })[metric.id] ?? Droplets;
  const StatusIcon = metric.status === "正常" ? CheckCircle2 : AlertCircle;
  const zoneColors: Record<string, string> = { "#00E676": "#65cfa2", "#FFD400": "#f4d47e", "#FF0000": "#ef8996" };
  const needleStyle = {
    "--gauge-angle": `${needleAngle}deg`,
    "--gauge-color": pointerColor,
  } as CSSProperties;
  const statusClass = metric.status === "正常"
    ? "is-normal"
    : metric.status === "预警"
      ? "is-warning"
      : metric.status === "异常"
        ? "is-abnormal"
        : "is-unknown";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${metric.name}，当前数值${metric.value}${metric.unit}，状态${metric.status}`}
      className={`metric-gauge-card ${selected ? "is-selected" : ""}`}
    >
      <span className="metric-gauge-layout">
        <span className="metric-gauge-header">
          <span className="metric-gauge-name"><MetricIcon aria-hidden="true" />{metric.name}</span>
          <span className={`metric-gauge-badge ${statusClass}`}><StatusIcon size={15} aria-hidden="true" />{metric.status}</span>
        </span>
        <span className="metric-gauge-dial" aria-hidden="true">
          <svg className="metric-gauge-svg" viewBox="0 -12 220 150">
            <path
              className="metric-gauge-track"
              d={gaugeArcPath(config.min, config.max, config)}
            />
            {config.zones.map((zone) => (
              <path
                key={`${zone.from}-${zone.to}`}
                className="metric-gauge-zone"
                d={gaugeArcPath(zone.from, zone.to, config)}
                stroke={zoneColors[zone.color] ?? zone.color}
              />
            ))}
            {Array.from({ length: 21 }, (_, index) => {
              const tickValue = config.min + ((config.max - config.min) * index) / 20;
              const outer = gaugePoint(tickValue, config, 71);
              const inner = gaugePoint(tickValue, config, index % 5 === 0 ? 64 : 67);
              return (
                <line
                  key={index}
                  className={index % 5 === 0 ? "metric-gauge-tick is-major" : "metric-gauge-tick"}
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                />
              );
            })}
            {Array.from({ length: 6 }, (_, index) => {
              const value = config.min + (config.max - config.min) * index / 5;
              const point = gaugePoint(value, config, 99);
              return <text key={index} className="metric-gauge-scale" x={point.x} y={point.y} textAnchor="middle" dominantBaseline="middle">{Number(value.toFixed(2))}</text>;
            })}
            <g className="metric-gauge-needle-position" style={needleStyle}>
                <line className="metric-gauge-needle" x1="110" y1="98" x2="110" y2="31" />
            </g>
            <circle className="metric-gauge-hub" cx="110" cy="98" r="5" style={{ fill: pointerColor }} />
            <text className="metric-gauge-unit" x="110" y="126" textAnchor="middle">{metric.unit.trim() || metric.name}</text>
          </svg>
        </span>
        <span className="metric-gauge-copy">
          <strong className="metric-gauge-value">
            {metric.value}<small>{metric.unit}</small>
          </strong>
          <span className="metric-gauge-range"><span>正常范围</span>{metric.normalRange}</span>
        </span>
      </span>
    </button>
  );
}

export default function MainPage() {
  const pools = POOLS;
  const [selectedPoolId, setSelectedPoolId] = usePersistentState("jack-dashboard-pool", "pool-1");
  const [selectedMetricId, setSelectedMetricId] = usePersistentState("jack-dashboard-metric", "temperature");
  const [selectedTimeRange, setSelectedTimeRange] = usePersistentState("jack-dashboard-range", "1h");
  const [isAlertDismissed, setIsAlertDismissed] = usePersistentState("jack-dashboard-alert-dismissed", false);
  // C6：场景与数据源统一由全局 Context 管理（与导航角标/其它页共享同一份状态）。
  const { dataSource, scenario, setScenario, demoRunning } = useData();
  // 自动演示按钮改为启动「导览」：自动依次切页讲解各核心模块（数据运行态由导览内部打开）。
  const { running: tourRunning, start: startTour, stop: stopTour } = useDemoTour();
  const live = dataSource === "live";
  const [mountTime] = useState(() => new Date());
  const selectedPool =
    pools.find((pool) => pool.id === selectedPoolId) ?? pools[0];

  // C5：优先读后端 /api/water-quality/latest（后端在时=真实链路）；不可达自动回退本地场景读数。
  const localMetrics = resolveReadings(selectedPoolId, scenario);
  const { data: activeMetrics, source: metricsSource, updatedAt: metricsUpdatedAt, reload: reloadLatest } = useApiData<MetricReading[]>(
    `/water-quality/latest?poolId=${selectedPoolId}`,
    localMetrics,
    { refreshInterval: live ? 15_000 : demoRunning ? DEMO_REFRESH_MS : 0 },
  );

  // C6/自动演示：场景变化（手动 chip 或演示循环驱动）时失效水质缓存并重取最新读数，
  // 使仪表盘即时反映新场景；通知后端模拟器切换场景的逻辑统一收敛在 DataContext 全局效应（各页共享）。
  const firstScenarioRun = useRef(true);
  const reloadLatestRef = useRef(reloadLatest);
  reloadLatestRef.current = reloadLatest;
  useEffect(() => {
    if (firstScenarioRun.current) {
      firstScenarioRun.current = false;
      return;
    }
    if (live) return;
    invalidateCache("/water-quality");
    reloadLatestRef.current();
  }, [scenario, live]);

  const selectScenario = (mode: ScenarioMode) => {
    setScenario(mode);
    setIsAlertDismissed(false);
  };

  const selectedMetric =
    activeMetrics.find((metric) => metric.id === selectedMetricId) ??
    activeMetrics[0];
  // C5：历史曲线——后端在时直渲真实降采样序列，否则回落 buildTrendSeries（保证同池同指标同曲线）。
  const { data: history } = useApiData<HistoryResponse | null>(
    `/water-quality/history?poolId=${selectedPool.id}&metricId=${selectedMetric.id}&range=${selectedTimeRange}`,
    null,
    { refreshInterval: live ? 15_000 : demoRunning ? DEMO_REFRESH_MS : 0 },
  );
  const updatedAt = metricsUpdatedAt ? new Date(metricsUpdatedAt) : mountTime;
  const updatedLabel = `${String(updatedAt.getHours()).padStart(2, "0")}:${String(updatedAt.getMinutes()).padStart(2, "0")}:${String(updatedAt.getSeconds()).padStart(2, "0")}`;
  const summary = summarizeReadings(activeMetrics);
  const worstLabel = summary.worst
    ? `${summary.worst.name} ${summary.worst.value}${summary.worst.unit}`
    : "";
  const activeAlertCount = summary.warningCount + summary.abnormalCount;
  const activeAlert =
    summary.tone === "normal"
      ? null
      : {
          title: summary.tone === "warning" ? "检测到水质预警" : "检测到水质异常",
          status: summary.tone === "warning" ? "需关注" : "未处理",
          message:
            summary.tone === "warning"
              ? `${selectedPool.name}${worstLabel}等指标接近或超过正常范围，建议加强观察并提前检查换水与增氧条件。`
              : `${selectedPool.name}${worstLabel}已超过正常范围，请及时检查换水情况并持续观察。`,
          symbol: "!",
          tone: summary.tone,
        };
  const activeAlertSummary = {
    normalCount: summary.normalCount,
    warningCount: summary.warningCount,
    abnormalCount: summary.abnormalCount,
    event:
      summary.tone === "warning"
        ? `${selectedPool.name} · ${summary.warningCount} 项指标预警`
        : summary.tone === "abnormal"
          ? `${selectedPool.name} · ${summary.abnormalCount} 项指标异常`
          : "当前无异常事件",
    handlingStatus:
      summary.tone === "warning"
        ? "需关注"
        : summary.tone === "abnormal"
          ? "未处理"
          : "运行正常",
    description:
      summary.tone === "warning"
        ? `${worstLabel} 已接近或超过正常范围，建议加强观察并提前检查换水与增氧条件。`
        : summary.tone === "abnormal"
          ? `${worstLabel} 已超过正常范围，建议立即检查换水、增氧及育苗池运行情况。`
          : "当前六项水质指标均处于正常范围，系统运行稳定，请继续保持常规监测。",
    tone: summary.tone,
  };
  return (
    <main className="system-page min-h-screen px-5 py-8 text-[#d7e2ea] sm:px-10 sm:py-12">
      <SystemNavigation
        active="dashboard"
        activeAlertCount={summary.tone === "normal" ? undefined : activeAlertCount}
        alertTone={
          summary.tone === "normal"
            ? undefined
            : summary.tone === "abnormal"
              ? "abnormal"
              : "warning"
        }
      />
      <section className="mx-auto max-w-6xl py-6">
        <PageHeader
          title="综合驾驶舱"
          subtitle="集中查看各育苗池的实时水质、运行状态与异常情况。"
        />
        {activeAlert && !isAlertDismissed && (
          <div
            className={
              activeAlert.tone === "warning"
                ? "mt-8 flex flex-wrap items-start justify-between gap-5 rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] px-5 py-4"
                : "mt-8 flex flex-wrap items-start justify-between gap-5 rounded-2xl border border-rose-300/25 bg-rose-300/[0.08] px-5 py-4"
            }
          >
            <div className="flex min-w-0 items-start gap-4">
              <div
                className={
                  activeAlert.tone === "warning"
                    ? "mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-300/30 bg-amber-300/10 text-lg text-amber-200"
                    : "mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rose-300/30 bg-rose-300/10 text-lg text-rose-200"
                }
              >
                {activeAlert.symbol}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <p
                    className={`font-semibold ${
                      activeAlert.tone === "warning"
                        ? "text-amber-100"
                        : "text-rose-100"
                    }`}
                  >
                    {activeAlert.title}
                  </p>

                  <span
                    className={
                      activeAlert.tone === "warning"
                        ? "rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-xs font-medium text-amber-200"
                        : "rounded-full border border-rose-300/25 bg-rose-300/10 px-2.5 py-1 text-xs font-medium text-rose-200"
                    }
                  >
                    {activeAlert.status}
                  </span>
                </div>

                <p className="mt-2 text-sm leading-6 text-[#d7e2ea]/70">
                  {activeAlert.message}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <Link
                href="/main/alerts"
                className={
                  activeAlert.tone === "warning"
                    ? "rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-300/15"
                    : "rounded-lg border border-rose-300/30 bg-rose-300/10 px-4 py-2 text-sm font-medium text-rose-100 transition-colors hover:bg-rose-300/15"
                }
              >
                查看异常
              </Link>

              <button
                type="button"
                onClick={() => setIsAlertDismissed(true)}
                aria-label="关闭异常提示"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-lg text-[#d7e2ea]/55"
              >
                ×
              </button>
            </div>
          </div>
        )}
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-wide text-[#e0f2fe]">育苗池状态</h2>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {pools.map((pool) => {
              const dotClass =
                pool.status === "正常"
                  ? "bg-emerald-400"
                  : pool.status === "预警"
                    ? "bg-amber-400"
                    : "bg-rose-400";
              return (
                <button
                  key={pool.id}
                  type="button"
                  onClick={() => setSelectedPoolId(pool.id)}
                  aria-pressed={pool.id === selectedPoolId}
                  className={
                    pool.id === selectedPoolId
                      ? "inline-flex items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-4 py-2.5"
                      : "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 transition-colors hover:border-cyan-300/25"
                  }
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} aria-hidden="true" />
                  <span className="text-sm font-semibold text-[#e0f2fe]">{pool.name}</span>
                  <span className={`text-xs font-medium ${toneClass(pool.status)}`}>{pool.status}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => (tourRunning ? stopTour() : startTour())}
              aria-pressed={tourRunning}
              title={
                tourRunning
                  ? "退出自动演示"
                  : "开始自动演示：自动依次讲解各功能模块并驱动数据刷新，约 3 分钟，无需人工操作"
              }
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                tourRunning
                  ? "border-rose-300/45 bg-rose-300/10 text-rose-200"
                  : "border-cyan-300/40 bg-cyan-300/10 text-cyan-100 hover:border-cyan-300/60"
              }`}
            >
              {tourRunning ? (
                <Square aria-hidden="true" size={15} strokeWidth={2} />
              ) : (
                <Play aria-hidden="true" size={15} strokeWidth={2} />
              )}
              <span>{tourRunning ? "停止演示" : "自动演示"}</span>
            </button>
          </div>
        </div>
        <div className="mt-6" data-tour="gauges">
          <div className="monitoring-section-heading">
            <h2>实时监测 <span>六项水质指标</span></h2>
            <a href="#metric-trend" className="monitoring-trend-link"><TrendingUp size={18} aria-hidden="true" />查看趋势</a>
          </div>

          <div className="metric-gauge-grid mt-4">
            {activeMetrics.map((metric) => (
              <MetricGauge
                key={metric.id}
                metric={metric}
                selected={metric.id === selectedMetricId}
                onSelect={() => setSelectedMetricId(metric.id)}
              />
            ))}
          </div>
        </div>
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-wide text-[#e0f2fe]">异常摘要</h2>
            <Link href="/main/alerts" className="text-sm font-medium text-cyan-300 transition-colors hover:text-cyan-200">查看详情</Link>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4 text-center">
              <span className="block text-sm text-[#d7e2ea]/60">正常</span>
              <strong className="mt-2 block text-3xl font-semibold text-emerald-300">{activeAlertSummary.normalCount}</strong>
            </div>
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-center">
              <span className="block text-sm text-[#d7e2ea]/60">预警</span>
              <strong className="mt-2 block text-3xl font-semibold text-amber-300">{activeAlertSummary.warningCount}</strong>
            </div>
            <div className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4 text-center">
              <span className="block text-sm text-[#d7e2ea]/60">异常</span>
              <strong className="mt-2 block text-3xl font-semibold text-rose-300">{activeAlertSummary.abnormalCount}</strong>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3">
          <span className="text-sm text-[#d7e2ea]/55">数据更新时间</span>
          <span className="text-sm font-medium text-[#e0f2fe]">{updatedLabel}</span>
        </div>
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4" data-tour="source">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-sm font-medium text-[#e0f2fe]">数据源</p>
              <p className="mt-1 text-xs leading-5 text-[#d7e2ea]/50">
                演示数据源默认走内置/后端演示链路；实时数据源只读传感器接口并每 15 秒轮询，接口不可达时自动降级。
              </p>
            </div>
            <DataSourceToggle source={metricsSource} />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-5 border-t border-white/[0.06] pt-5">
            <div>
              <p className="text-sm font-medium text-[#e0f2fe]">监测场景</p>
              <p className="mt-1 text-xs leading-5 text-[#d7e2ea]/50">
                “正常运行”保留各育苗池实际状态；轻度预警 / 异常事件 / 异常恢复场景用于演示对应处置流程。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {SCENARIO_OPTIONS.map((option) => (
                <ChipButton
                  key={option.id}
                  active={scenario === option.id}
                  onClick={() => selectScenario(option.id)}
                  activeClassName={option.activeClass}
                  inactiveClassName={SCENARIO_INACTIVE_CLASS}
                >
                  {option.label}
                </ChipButton>
              ))}
            </div>
          </div>
        </div>
        <div id="metric-trend" className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-6" data-tour="trend">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-sm text-[#d7e2ea]/55">指标趋势</p>
              <h2 className="mt-2 text-xl font-semibold text-[#e0f2fe]">
                {selectedMetric.name}变化趋势
              </h2>
            </div>

            <TimeRangeButtons options={[["1h", "最近1小时"], ["6h", "最近6小时"], ["24h", "最近24小时"], ["7d", "最近7天"]]} value={selectedTimeRange} onChange={setSelectedTimeRange} />
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <span className="text-[#d7e2ea]/65">
              当前值：
              <strong className="ml-1 font-semibold text-[#e0f2fe]">
                {`${selectedMetric.value}${selectedMetric.unit}`}
              </strong>
            </span>

            <span className="text-[#d7e2ea]/65">
              正常范围：
              <strong className="ml-1 font-semibold text-emerald-300">
                {selectedMetric.normalRange}
              </strong>
            </span>

            <span className="text-[#d7e2ea]/65">
              当前状态：
              <strong
                className={`ml-1 font-semibold ${
                  selectedMetric.status === "正常"
                    ? "text-emerald-300"
                    : selectedMetric.status === "预警"
                      ? "text-amber-300"
                      : "text-rose-300"
                }`}
              >
                {selectedMetric.status}
              </strong>
            </span>
          </div>

          <TrendLineChart
            className="mt-7"
            metricId={selectedMetric.id}
            currentValue={selectedMetric.value}
            range={selectedTimeRange}
            seed={trendSeed(selectedPool.id, selectedMetric.id)}
            status={selectedMetric.status}
            points={history?.points}
          />

          <div className="mt-4 flex flex-wrap gap-5 text-xs text-[#d7e2ea]/55">
            <span>绿色区域：正常范围</span>
            <span>黄色虚线：预警线</span>
            <span>红色虚线：异常线</span>
          </div>
        </div>
        <div className="mt-8">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-[#d7e2ea]/55">状态说明</p>
                <h2 className="mt-2 text-xl font-semibold text-[#e0f2fe]">
                  当前水质状态
                </h2>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-rose-300/20 bg-rose-300/[0.05] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-medium text-rose-200">
                  {activeAlertSummary.event}
                </span>
                <span
                  className={`rounded-full bg-rose-300/10 px-2.5 py-1 text-xs font-medium ${
                    activeAlertSummary.tone === "normal"
                      ? "text-emerald-300"
                      : activeAlertSummary.tone === "warning"
                        ? "text-amber-300"
                        : "text-rose-300"
                  }`}
                >
                  {activeAlertSummary.handlingStatus}
                </span>
              </div>

              <p className="mt-3 text-sm leading-6 text-[#d7e2ea]/65">
                {activeAlertSummary.description}
              </p>
            </div>
          </div>
        </div>
        <p className="system-demo-notice">
          数据源：{live ? "实时" : "演示"} · 取数：{metricsSource === "api" ? "后端接口" : "内置模拟"} · 场景：{SCENARIO_OPTIONS.find((option) => option.id === scenario)?.label ?? scenario} · 更新时间：{updatedLabel} · {selectedPool.name}关注指标：{activeAlertCount}
        </p>
      </section>
    </main>
  );
}
