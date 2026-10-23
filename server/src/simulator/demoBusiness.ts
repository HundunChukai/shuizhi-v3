// 演示模式「业务闭环」驱动：前端「自动演示」运行期间，周期性生成
// “投放 → 投放后监测 → 收尾” 的演示事件，使投放记录 / 投放后监测两页
// 也随全站保持动态变化（模拟器 tick 本身只写传感器行与 alerts）。
// 心跳机制：前端运行中周期 POST /demo/run 刷新 lastBeat；超过 HEARTBEAT_TIMEOUT_MS
// 无心跳自动停摆——避免用户直接关页/断网后后端继续往业务表写演示数据。
import type { Database } from "../db/driver.ts";
import { POOLS } from "../../../src/app/data/pools.ts";
import { createDosingWithMonitoring, closeMonitoring } from "../services/dosingService.ts";

// 心跳超时：前端每 8s 心跳一次，25s 未收到即视为演示已结束。
const HEARTBEAT_TIMEOUT_MS = 25_000;
// 每 CREATE_EVERY_TICKS 个 tick 生成一笔投放（在监测任务少于 MAX_OPEN 时）；
// 开工超过 CLOSE_AFTER_MS 的监测任务随即收尾（after_metrics 取最新读数）。
const CREATE_EVERY_TICKS = 2;
const MAX_OPEN = 2;
const CLOSE_AFTER_MS = 30_000;

// 轮换池与诱导剂组合，避免连续生成完全相同的台账行。
const AGENT_SPECS = [
  { agent: "肾上腺素", concentration: "10⁻⁴ mol/L", dosage: "2.0 L" },
  { agent: "氯化钾", concentration: "18 mmol/L", dosage: "2.1 L" },
  { agent: "去甲肾上腺素", concentration: "5×10⁻⁵ mol/L", dosage: "1.6 L" },
];

let lastBeat = 0;
let ticks = 0;
let cursor = 0;

// running=true → 记录心跳；running=false → 立即停摆。
// 注意：心跳每 8s 一次、tick 每 10s 一次——计数器只能在「非活跃→活跃」的启动瞬间重置，
// 若每次心跳都重置，ticks 永远到不了 CREATE_EVERY_TICKS，投放生成分支将永不执行。
export function setDemoRun(running: boolean): void {
  const now = Date.now();
  const wasActive = demoRunActive(now);
  lastBeat = running ? now : 0;
  if (running && !wasActive) ticks = 0;
}

export function demoRunActive(now = Date.now()): boolean {
  return lastBeat > 0 && now - lastBeat < HEARTBEAT_TIMEOUT_MS;
}

export interface DemoBusinessResult {
  dosingCreated: number;
  monitoringClosed: number;
}

// 每个 simulator tick 后调用；非运行态为 no-op。
export function demoBusinessTick(db: Database, now = Date.now()): DemoBusinessResult {
  const out: DemoBusinessResult = { dosingCreated: 0, monitoringClosed: 0 };
  if (!demoRunActive(now)) return out;
  ticks += 1;

  // MonitoringTask 前端类型不带 started_at，这里直接按开始时间升序取「正在监测」任务。
  const open = db
    .prepare("SELECT id, started_at FROM monitoring_records WHERE status = '正在监测' ORDER BY started_at ASC")
    .all()
    .map((row) => ({ id: String(row.id), startedAt: Number(row.started_at) }));

  // 先收尾：最老的超期任务闭环（服务端自动算 change/result/conclusion）。
  const stale = open[0];
  if (stale && now - stale.startedAt > CLOSE_AFTER_MS) {
    closeMonitoring(db, stale.id, now);
    out.monitoringClosed = 1;
    open.shift();
  }

  // 再开工：控制并发数，轮换池/诱导剂生成一笔投放（同建监测任务）。
  if (ticks % CREATE_EVERY_TICKS === 0 && open.length < MAX_OPEN) {
    const pool = POOLS[cursor % POOLS.length];
    const spec = AGENT_SPECS[cursor % AGENT_SPECS.length];
    cursor += 1;
    createDosingWithMonitoring(
      db,
      {
        poolId: pool.id,
        agent: spec.agent,
        concentration: spec.concentration,
        dosage: spec.dosage,
        operator: "自动演示模拟器",
        result: "已投放",
        note: "自动演示运行期间自动生成的演示事件",
        duration: "6小时",
      },
      now,
    );
    out.dosingCreated = 1;
  }

  return out;
}
