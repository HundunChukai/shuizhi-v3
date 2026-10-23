// Seed：直接复用前端 src/app/data/*.ts（单一数据源，杜绝前后端两份数据漂移）。
// 仅当 pools 表为空时写入：4 池 + 每池每指标 1 个传感器 + 历史 alerts / dosing / monitoring。
// 为保证 GET 接口与前端 fallback「逐字段一致」，展示字符串（value/time）与 JSON（before/after_metrics）原样入库；
// 结构化 epoch 由 lib/time.parseDisplayTime 从展示时间派生，用于排序（并按数组序 -i 保证稳定次序）。
//
// 注意：water_quality_records 不在此写入 —— 由模拟器（B6）首启回填 24h 历史，避免与回填的「空表」判定冲突。

import { POOLS } from "../../../src/app/data/pools.ts";
import { alerts as seedAlerts } from "../../../src/app/data/alerts.ts";
import { dosingRecords as seedDosing } from "../../../src/app/data/dosingRecords.ts";
import { monitoringTasks as seedMonitoring } from "../../../src/app/data/monitoringTasks.ts";
import { METRIC_ORDER, METRICS } from "../../../src/app/data/metrics.ts";
import type { Database } from "./driver.ts";
import { durationToMs, parseDisplayTime } from "../lib/time.ts";

function countOf(db: Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
  return Number(row?.n ?? 0);
}

export interface SeedResult {
  seeded: boolean;
  counts: Record<string, number>;
}

export function seed(db: Database): SeedResult {
  const before = {
    pools: countOf(db, "pools"),
    sensors: countOf(db, "sensors"),
    alerts: countOf(db, "alerts"),
    dosing_records: countOf(db, "dosing_records"),
    monitoring_records: countOf(db, "monitoring_records"),
  };
  if (before.pools > 0) return { seeded: false, counts: before };

  const now = Date.now();

  // 指标中文名 → 规范 id（alerts.ts 的 metric 字段存的是中文名）。
  const nameToId = new Map<string, string>();
  for (const id of METRIC_ORDER) nameToId.set(METRICS[id].name, id);

  const insPool = db.prepare(
    `INSERT INTO pools (id, name, species, batch, stage, status, start_date, density, water_volume, manager, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insSensor = db.prepare(
    `INSERT INTO sensors (id, pool_id, metric_id, device_name, unit, status, installed_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insAlert = db.prepare(
    `INSERT INTO alerts (id, pool_id, metric_id, level, value_text, status, time_text, description, suggestion, action, result, note, triggered_at, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insDosing = db.prepare(
    `INSERT INTO dosing_records (id, pool_id, batch, agent, concentration, dosage, operator, result, note, time_text, dosed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insMonitoring = db.prepare(
    `INSERT INTO monitoring_records (id, pool_id, dosing_record_id, agent, concentration, dosage, status, result, description, duration, conclusion, recovery, before_metrics, after_metrics, start_time_text, started_at, measured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  db.exec("BEGIN");
  try {
    // 1) 育苗池
    for (const p of POOLS) {
      insPool.run(
        p.id, p.name, p.species, p.batch, p.stage, p.status,
        p.startDate, p.density, p.waterVolume, p.manager, p.description, now,
      );
    }

    // 2) 传感器（每池每指标一个）
    for (const p of POOLS) {
      const installedAt = Number.isNaN(Date.parse(p.startDate)) ? now : Date.parse(p.startDate);
      for (const metricId of METRIC_ORDER) {
        const metric = METRICS[metricId];
        insSensor.run(
          `sensor-${p.id}-${metricId}`, p.id, metricId,
          `${p.name}${metric.name}传感器`, metric.unit, "在线", installedAt, now,
        );
      }
    }

    // 3) 异常预警
    seedAlerts.forEach((a, i) => {
      const triggeredAt = parseDisplayTime(a.time, now) - i;
      insAlert.run(
        a.id, a.poolId, nameToId.get(a.metric) ?? "temperature", a.level,
        a.value, a.status, a.time, a.description, a.suggestion, a.action, a.result, "",
        triggeredAt, a.status === "已关闭" ? triggeredAt + 3_600_000 : null,
      );
    });

    // 4) 投放记录台账
    seedDosing.forEach((d, i) => {
      insDosing.run(
        d.id, d.poolId, d.batch, d.agent, d.concentration, d.dosage,
        d.operator, d.result, "", d.time, parseDisplayTime(d.time, now) - i,
      );
    });

    // 5) 投放后监测（before/after_metrics 原样存 JSON，保留 mock 的短 id 与展示值）
    seedMonitoring.forEach((m, i) => {
      const startedAt = parseDisplayTime(m.startTime, now) - i;
      insMonitoring.run(
        m.id, m.poolId, null, m.agent, m.concentration, m.dosage, m.status, m.result,
        m.description, m.duration, m.conclusion, m.recovery,
        JSON.stringify(m.beforeMetrics), JSON.stringify(m.afterMetrics),
        m.startTime, startedAt,
        m.status === "已完成" ? startedAt + durationToMs(m.duration) : null,
      );
    });

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return {
    seeded: true,
    counts: {
      pools: countOf(db, "pools"),
      sensors: countOf(db, "sensors"),
      alerts: countOf(db, "alerts"),
      dosing_records: countOf(db, "dosing_records"),
      monitoring_records: countOf(db, "monitoring_records"),
    },
  };
}
