// monitoring_records 仓储：投放后监测读写。行 → 前端 MonitoringTask（JOIN pools 取池名/品种，
// before/after_metrics 以 JSON 文本存储，读出时 JSON.parse 还原为数组）。
import type { Database, Row, SqlParam } from "../db/driver.ts";
import type {
  MonitoringTask,
  MonitoringMetricBefore,
  MonitoringMetricAfter,
} from "../../../src/app/data/monitoringTasks.ts";

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  try {
    const parsed = JSON.parse(String(raw)) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function mapMonitoring(row: Row): MonitoringTask {
  return {
    id: String(row.id),
    poolId: String(row.pool_id),
    pool: String(row.pool_name ?? ""),
    species: String(row.species ?? ""),
    agent: String(row.agent),
    concentration: String(row.concentration ?? ""),
    dosage: String(row.dosage ?? ""),
    startTime: String(row.start_time_text),
    status: String(row.status),
    result: String(row.result),
    description: String(row.description ?? ""),
    duration: String(row.duration ?? ""),
    conclusion: String(row.conclusion ?? ""),
    recovery: String(row.recovery ?? ""),
    beforeMetrics: parseJson<MonitoringMetricBefore[]>(row.before_metrics, []),
    afterMetrics: parseJson<MonitoringMetricAfter[]>(row.after_metrics, []),
  };
}

const SELECT_JOIN = `
  SELECT m.*, p.name AS pool_name, p.species AS species
  FROM monitoring_records m LEFT JOIN pools p ON p.id = m.pool_id`;

export interface MonitoringQuery {
  poolId?: string;
  taskId?: string;
}

export function listMonitoring(db: Database, query: MonitoringQuery = {}): MonitoringTask[] {
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (query.poolId) {
    where.push("m.pool_id = ?");
    params.push(query.poolId);
  }
  if (query.taskId) {
    where.push("m.id = ?");
    params.push(query.taskId);
  }
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  return db
    .prepare(`${SELECT_JOIN}${whereSql} ORDER BY m.started_at DESC, m.rowid DESC`)
    .all(...params)
    .map(mapMonitoring);
}

export function getMonitoringById(db: Database, id: string): MonitoringTask | undefined {
  const row = db.prepare(`${SELECT_JOIN} WHERE m.id = ?`).get(id);
  return row ? mapMonitoring(row) : undefined;
}

// 某投放记录关联的监测任务（B8：POST 投放时同建监测，收尾时按 dosing_record_id 反查）。
export function findByDosingId(db: Database, dosingRecordId: string): MonitoringTask | undefined {
  const row = db.prepare(`${SELECT_JOIN} WHERE m.dosing_record_id = ? LIMIT 1`).get(dosingRecordId);
  return row ? mapMonitoring(row) : undefined;
}

export interface NewMonitoring {
  id: string;
  poolId: string;
  dosingRecordId?: string | null;
  agent: string;
  concentration?: string;
  dosage?: string;
  status: string;
  result: string;
  description?: string;
  duration?: string;
  conclusion?: string;
  recovery?: string;
  beforeMetrics: MonitoringMetricBefore[];
  afterMetrics?: MonitoringMetricAfter[];
  startTimeText: string;
  startedAt: number;
  measuredAt?: number | null;
}

export function insertMonitoring(db: Database, m: NewMonitoring): void {
  db.prepare(
    `INSERT INTO monitoring_records (id, pool_id, dosing_record_id, agent, concentration, dosage,
       status, result, description, duration, conclusion, recovery,
       before_metrics, after_metrics, start_time_text, started_at, measured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    m.id, m.poolId, m.dosingRecordId ?? null, m.agent, m.concentration ?? "", m.dosage ?? "",
    m.status, m.result, m.description ?? "", m.duration ?? "", m.conclusion ?? "", m.recovery ?? "",
    JSON.stringify(m.beforeMetrics), JSON.stringify(m.afterMetrics ?? []),
    m.startTimeText, m.startedAt, m.measuredAt ?? null,
  );
}

export interface MonitoringPatch {
  status?: string;
  result?: string;
  conclusion?: string;
  recovery?: string;
  afterMetrics?: MonitoringMetricAfter[];
  measuredAt?: number;
}

// B8 收尾：写入 after_metrics 快照 + 服务端算出的 result/conclusion/recovery/status。
export function updateMonitoring(db: Database, id: string, patch: MonitoringPatch): boolean {
  const fields: string[] = [];
  const params: SqlParam[] = [];
  if (patch.status !== undefined) {
    fields.push("status = ?");
    params.push(patch.status);
  }
  if (patch.result !== undefined) {
    fields.push("result = ?");
    params.push(patch.result);
  }
  if (patch.conclusion !== undefined) {
    fields.push("conclusion = ?");
    params.push(patch.conclusion);
  }
  if (patch.recovery !== undefined) {
    fields.push("recovery = ?");
    params.push(patch.recovery);
  }
  if (patch.afterMetrics !== undefined) {
    fields.push("after_metrics = ?");
    params.push(JSON.stringify(patch.afterMetrics));
  }
  if (patch.measuredAt !== undefined) {
    fields.push("measured_at = ?");
    params.push(patch.measuredAt);
  }
  if (!fields.length) return false;
  params.push(id);
  const r = db
    .prepare(`UPDATE monitoring_records SET ${fields.join(", ")} WHERE id = ?`)
    .run(...params);
  return r.changes > 0;
}
