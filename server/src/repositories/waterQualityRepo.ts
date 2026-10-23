// water_quality_records 仓储：时序主表读写（增长最快，性能核心）。
// 承担 B6 首启回填、B7 单事务批写、B9 history 降采样 + keyset 分页、B10 保留期清理。
// 本模块只做 SQL 与行→结构映射，不做状态判定（status 由写入方或 service 用 metrics.deriveStatus 决定）。
import type { Database, Row, SqlParam } from "../db/driver.ts";

export type RecordSource = "demo" | "live" | "sensor";

export interface NewRecord {
  poolId: string;
  sensorId?: string | null;
  metricId: string;
  value: number;
  status: string;
  scenario: string;
  source: RecordSource;
  recordedAt: number;
}

export interface LatestReading {
  poolId: string;
  metricId: string;
  value: number;
  status: string;
  recordedAt: number;
  scenario: string;
  source: string;
}

export interface HistoryPoint {
  t: number; // epoch ms
  value: number; // 降采样桶为 AVG，原始行为该点值
  min?: number; // 桶内最小（仅降采样时提供）
  max?: number; // 桶内最大（仅降采样时提供）
  count?: number; // 桶内样本数（仅降采样时提供）
}

export interface HistoryQuery {
  poolId: string;
  metricId: string;
  range?: string; // 1h | 6h | 24h | 7d | 30d
  limit?: number;
  cursor?: number; // keyset：recorded_at 上界（含），用于向更早翻页
}

export interface HistoryResult {
  points: HistoryPoint[]; // 时间升序（供绘图直接使用）
  nextCursor: number | null; // 若仍有更早数据则为本页最旧点 t，否则 null
  downsampled: boolean;
  rawCount: number;
  range: string;
  since: number;
  upper: number;
}

// range → 时间窗（毫秒）与目标点数（目标点数复用前端 TrendLineChart 的 sampleCounts，保持前后端一致）
const RANGE_MS: Record<string, number> = {
  "1h": 3_600_000,
  "6h": 6 * 3_600_000,
  "24h": 24 * 3_600_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};
const TARGET_POINTS: Record<string, number> = {
  "1h": 25,
  "6h": 37,
  "24h": 49,
  "7d": 57,
  "30d": 61,
};
const DEFAULT_RANGE = "24h";

export function countAll(db: Database): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM water_quality_records").get();
  return Number(row?.n ?? 0);
}

export function isEmpty(db: Database): boolean {
  return countAll(db) === 0;
}

// B7：单次 tick 的 池×指标 行在一个事务内批量 INSERT（一次 fsync 落全部，不阻塞事件循环）。
export function insertBatch(db: Database, records: NewRecord[]): number {
  if (records.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT INTO water_quality_records
       (pool_id, sensor_id, metric_id, value, status, scenario, source, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.exec("BEGIN");
  try {
    for (const r of records) {
      stmt.run(
        r.poolId,
        r.sensorId ?? null,
        r.metricId,
        r.value,
        r.status,
        r.scenario,
        r.source,
        r.recordedAt,
      );
    }
    db.exec("COMMIT");
    return records.length;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function insertOne(db: Database, r: NewRecord): number {
  const res = db
    .prepare(
      `INSERT INTO water_quality_records
         (pool_id, sensor_id, metric_id, value, status, scenario, source, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      r.poolId,
      r.sensorId ?? null,
      r.metricId,
      r.value,
      r.status,
      r.scenario,
      r.source,
      r.recordedAt,
    );
  return res.lastInsertRowid;
}

// 每 (池,指标) 的最新一条读数（相关子查询取最新 id，tie-safe：ORDER BY recorded_at DESC, id DESC）。
export function latestPerMetric(db: Database, poolId?: string): LatestReading[] {
  const sql = `
    SELECT w.pool_id, w.metric_id, w.value, w.status, w.recorded_at, w.scenario, w.source
    FROM water_quality_records w
    WHERE w.id = (
      SELECT w2.id FROM water_quality_records w2
      WHERE w2.pool_id = w.pool_id AND w2.metric_id = w.metric_id
      ORDER BY w2.recorded_at DESC, w2.id DESC LIMIT 1
    )${poolId ? " AND w.pool_id = ?" : ""}
    ORDER BY w.pool_id ASC, w.metric_id ASC`;
  const rows: Row[] = poolId ? db.prepare(sql).all(poolId) : db.prepare(sql).all();
  return rows.map((r) => ({
    poolId: String(r.pool_id),
    metricId: String(r.metric_id),
    value: Number(r.value),
    status: String(r.status),
    recordedAt: Number(r.recorded_at),
    scenario: String(r.scenario ?? "normal"),
    source: String(r.source ?? "demo"),
  }));
}

// 单个 (池,指标) 的最新读数（模拟器取 prev 值 / B8 投放前后快照用）。
export function latestValue(
  db: Database,
  poolId: string,
  metricId: string,
): LatestReading | undefined {
  const row = db
    .prepare(
      `SELECT pool_id, metric_id, value, status, recorded_at, scenario, source
       FROM water_quality_records
       WHERE pool_id = ? AND metric_id = ?
       ORDER BY recorded_at DESC, id DESC LIMIT 1`,
    )
    .get(poolId, metricId);
  if (!row) return undefined;
  return {
    poolId: String(row.pool_id),
    metricId: String(row.metric_id),
    value: Number(row.value),
    status: String(row.status),
    recordedAt: Number(row.recorded_at),
    scenario: String(row.scenario ?? "normal"),
    source: String(row.source ?? "demo"),
  };
}

// 全表最新 recorded_at（summary.lastUpdatedAt / 数据更新时间）。
export function mostRecentRecordedAt(db: Database): number | null {
  const row = db.prepare("SELECT MAX(recorded_at) AS t FROM water_quality_records").get();
  const t = row?.t;
  return t == null ? null : Number(t);
}

// B9：history —— range 映射时间窗与目标点数；原始行数 > 目标点数时用 SQL 时间分桶聚合（AVG/MIN/MAX）
// 返回 ≤ 目标点数；否则返回原始行（keyset 分页，避免 OFFSET 深翻）。points 为时间升序。
export function history(db: Database, q: HistoryQuery, now = Date.now()): HistoryResult {
  const range = q.range && RANGE_MS[q.range] ? q.range : DEFAULT_RANGE;
  const spanMs = RANGE_MS[range];
  const targetPoints = TARGET_POINTS[range];
  const upper = q.cursor ?? now; // 含上界
  const since = upper - spanMs; // 不含下界
  const limit = Math.min(5000, Math.max(1, q.limit ?? targetPoints));

  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM water_quality_records
       WHERE pool_id = ? AND metric_id = ? AND recorded_at > ? AND recorded_at <= ?`,
    )
    .get(q.poolId, q.metricId, since, upper);
  const rawCount = Number(countRow?.n ?? 0);
  if (rawCount === 0) {
    return { points: [], nextCursor: null, downsampled: false, rawCount, range, since, upper };
  }

  if (rawCount > targetPoints) {
    // 时间分桶：bucketMs = ceil(span / targetPoints)。CAST 强制整数除法（node:sqlite 可能把 JS number 绑为 REAL）。
    const bucketMs = Math.max(1, Math.ceil(spanMs / targetPoints));
    const rows = db
      .prepare(
        `SELECT AVG(value) AS avg_v, MIN(value) AS min_v, MAX(value) AS max_v,
                MAX(recorded_at) AS last_t, COUNT(*) AS n
         FROM water_quality_records
         WHERE pool_id = ? AND metric_id = ? AND recorded_at > ? AND recorded_at <= ?
         GROUP BY (CAST(recorded_at AS INTEGER) / CAST(? AS INTEGER))
         ORDER BY last_t ASC`,
      )
      .all(q.poolId, q.metricId, since, upper, bucketMs);
    const points: HistoryPoint[] = rows.map((r) => ({
      t: Number(r.last_t),
      value: Number(r.avg_v),
      min: Number(r.min_v),
      max: Number(r.max_v),
      count: Number(r.n),
    }));
    return { points, nextCursor: null, downsampled: true, rawCount, range, since, upper };
  }

  // 原始行：按 recorded_at DESC 取 limit 行（走复合索引），再反转为升序供绘图。
  const rows = db
    .prepare(
      `SELECT recorded_at AS t, value FROM water_quality_records
       WHERE pool_id = ? AND metric_id = ? AND recorded_at > ? AND recorded_at <= ?
       ORDER BY recorded_at DESC, id DESC LIMIT ?`,
    )
    .all(q.poolId, q.metricId, since, upper, limit);
  const desc: HistoryPoint[] = rows.map((r) => ({ t: Number(r.t), value: Number(r.value) }));
  const nextCursor =
    rawCount > limit && desc.length > 0 ? desc[desc.length - 1].t : null;
  const points = desc.slice().reverse();
  return { points, nextCursor, downsampled: false, rawCount, range, since, upper };
}

// B10：删除保留期之前的原始行（启动时 + 每小时执行）。返回删除行数。
export function deleteOlderThan(db: Database, epochMs: number): number {
  const res = db
    .prepare("DELETE FROM water_quality_records WHERE recorded_at < ?")
    .run(epochMs);
  return res.changes;
}
