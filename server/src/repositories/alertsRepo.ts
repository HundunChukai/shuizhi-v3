// alerts 仓储：预警读写。行 → 前端 AlertRecord 类型映射（JOIN pools 取池名/品种，metric_id → 中文名）。
// 返回严格对齐 AlertRecord 的 13 个字段，保证与前端 fallback 逐字段一致。
import type { Database, Row, SqlParam } from "../db/driver.ts";
import type { AlertRecord } from "../../../src/app/data/alerts.ts";
import { getMetric } from "../../../src/app/data/metrics.ts";

function mapAlert(row: Row): AlertRecord {
  return {
    id: String(row.id),
    poolId: String(row.pool_id),
    pool: String(row.pool_name ?? ""),
    species: String(row.species ?? ""),
    metric: getMetric(String(row.metric_id)).name,
    value: String(row.value_text),
    level: String(row.level),
    status: String(row.status),
    time: String(row.time_text),
    description: String(row.description ?? ""),
    suggestion: String(row.suggestion ?? ""),
    action: String(row.action ?? ""),
    result: String(row.result ?? ""),
    note: String(row.note ?? ""),
  };
}

const SELECT_JOIN = `
  SELECT a.*, p.name AS pool_name, p.species AS species
  FROM alerts a LEFT JOIN pools p ON p.id = a.pool_id`;

export interface AlertQuery {
  status?: string;
  poolId?: string;
  metricId?: string;
  from?: number;
  to?: number;
  page?: number;
  pageSize?: number;
}

// 明细查询的 WHERE 构造（列表与分组共用，避免两处口径漂移）。
function buildAlertWhere(query: AlertQuery): { sql: string; params: SqlParam[] } {
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (query.status) {
    where.push("a.status = ?");
    params.push(query.status);
  }
  if (query.poolId) {
    where.push("a.pool_id = ?");
    params.push(query.poolId);
  }
  if (query.metricId) {
    where.push("a.metric_id = ?");
    params.push(query.metricId);
  }
  if (typeof query.from === "number") {
    where.push("a.triggered_at >= ?");
    params.push(query.from);
  }
  if (typeof query.to === "number") {
    where.push("a.triggered_at <= ?");
    params.push(query.to);
  }
  return { sql: where.length ? ` WHERE ${where.join(" AND ")}` : "", params };
}

export function listAlerts(
  db: Database,
  query: AlertQuery = {},
): { items: AlertRecord[]; total: number; page: number; pageSize: number } {
  const { sql: whereSql, params } = buildAlertWhere(query);
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM alerts a${whereSql}`)
    .get(...params);
  const total = Number(totalRow?.n ?? 0);

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
  const rows = db
    .prepare(
      `${SELECT_JOIN}${whereSql} ORDER BY a.triggered_at DESC, a.rowid DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { items: rows.map(mapAlert), total, page, pageSize };
}

// ── 事件组（池 × 指标）聚合：预警中心 L1 折叠列表 ───────────────────────────────
export interface AlertGroupQuery {
  // 组内「包含任一状态」即命中；未传/空数组 = 不限。
  statuses?: string[];
  poolId?: string;
  metricId?: string;
  level?: string;
  // 仅保留「最近一次发生」在此刻之后（from）/ 之前（to）的组。
  from?: number;
  to?: number;
  page?: number;
  pageSize?: number;
}

export interface AlertGroupRow {
  poolId: string;
  pool: string;
  species: string;
  metricId: string;
  metric: string;
  latestValue: string;
  latestTime: string;
  // 组内最高等级：有异常即异常，否则预警（避免被大量预警记录淹没）。
  maxLevel: string;
  count: number;
  firstAt: number;
  lastAt: number;
  statusCounts: Record<string, number>;
}

export function listAlertGroups(
  db: Database,
  query: AlertGroupQuery = {},
): { items: AlertGroupRow[]; total: number; page: number; pageSize: number } {
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (query.poolId) {
    where.push("a.pool_id = ?");
    params.push(query.poolId);
  }
  if (query.metricId) {
    where.push("a.metric_id = ?");
    params.push(query.metricId);
  }

  // 状态 / 等级 / 时间范围必须走 HAVING：它们决定「哪些组入选」。
  // 若写进 WHERE，会先把组内不匹配的记录滤掉，导致 COUNT(*) 与组内状态分布失真。
  const having: string[] = [];
  const havingParams: SqlParam[] = [];
  if (query.statuses && query.statuses.length > 0) {
    having.push(
      `SUM(CASE WHEN a.status IN (${query.statuses.map(() => "?").join(", ")}) THEN 1 ELSE 0 END) > 0`,
    );
    havingParams.push(...query.statuses);
  }
  // 等级按「组内最高等级」语义，与前端组卡徽章一致：
  //   异常 → 组内存在异常记录；预警 → 组内不存在异常记录（最高等级即预警）。
  // 这样服务端筛选结果与无后端时前端本地过滤的口径完全相同。
  if (query.level === "异常") {
    having.push("SUM(CASE WHEN a.level = '异常' THEN 1 ELSE 0 END) > 0");
  } else if (query.level === "预警") {
    having.push("SUM(CASE WHEN a.level = '异常' THEN 1 ELSE 0 END) = 0");
  }
  if (typeof query.from === "number") {
    having.push("MAX(a.triggered_at) >= ?");
    havingParams.push(query.from);
  }
  if (typeof query.to === "number") {
    having.push("MAX(a.triggered_at) <= ?");
    havingParams.push(query.to);
  }

  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const havingSql = having.length ? ` HAVING ${having.join(" AND ")}` : "";
  const groupSql = ` FROM alerts a LEFT JOIN pools p ON p.id = a.pool_id${whereSql} GROUP BY a.pool_id, a.metric_id${havingSql}`;

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM (SELECT 1${groupSql})`)
    .get(...params, ...havingParams);
  const total = Number(totalRow?.n ?? 0);

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
  const latestSub = (col: string): string =>
    `(SELECT x.${col} FROM alerts x WHERE x.pool_id = a.pool_id AND x.metric_id = a.metric_id
       ORDER BY x.triggered_at DESC, x.rowid DESC LIMIT 1)`;
  const rows = db
    .prepare(
      `SELECT a.pool_id, a.metric_id, p.name AS pool_name, p.species AS species,
              COUNT(*) AS n,
              MIN(a.triggered_at) AS first_at,
              MAX(a.triggered_at) AS last_at,
              SUM(CASE WHEN a.status = '未处理' THEN 1 ELSE 0 END) AS s_unhandled,
              SUM(CASE WHEN a.status = '处理中' THEN 1 ELSE 0 END) AS s_doing,
              SUM(CASE WHEN a.status = '观察中' THEN 1 ELSE 0 END) AS s_watch,
              SUM(CASE WHEN a.status = '已关闭' THEN 1 ELSE 0 END) AS s_closed,
              SUM(CASE WHEN a.level = '异常' THEN 1 ELSE 0 END) AS abnormal_n,
              ${latestSub("value_text")} AS latest_value,
              ${latestSub("time_text")} AS latest_time_text
       ${groupSql}
       ORDER BY last_at DESC, a.pool_id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, ...havingParams, pageSize, (page - 1) * pageSize);

  return {
    items: rows.map((row) => ({
      poolId: String(row.pool_id),
      pool: String(row.pool_name ?? ""),
      species: String(row.species ?? ""),
      metricId: String(row.metric_id),
      metric: getMetric(String(row.metric_id)).name,
      latestValue: String(row.latest_value ?? ""),
      latestTime: String(row.latest_time_text ?? ""),
      maxLevel: Number(row.abnormal_n ?? 0) > 0 ? "异常" : "预警",
      count: Number(row.n ?? 0),
      firstAt: Number(row.first_at ?? 0),
      lastAt: Number(row.last_at ?? 0),
      statusCounts: {
        未处理: Number(row.s_unhandled ?? 0),
        处理中: Number(row.s_doing ?? 0),
        观察中: Number(row.s_watch ?? 0),
        已关闭: Number(row.s_closed ?? 0),
      },
    })),
    total,
    page,
    pageSize,
  };
}

export function getAlertById(db: Database, id: string): AlertRecord | undefined {
  const row = db.prepare(`${SELECT_JOIN} WHERE a.id = ?`).get(id);
  return row ? mapAlert(row) : undefined;
}

export interface NewAlert {
  id: string;
  poolId: string;
  metricId: string;
  level: string;
  valueText: string;
  status: string;
  timeText: string;
  description?: string;
  suggestion?: string;
  action?: string;
  result?: string;
  note?: string;
  triggeredAt: number;
  closedAt?: number | null;
}

export function insertAlert(db: Database, a: NewAlert): void {
  db.prepare(
    `INSERT INTO alerts (id, pool_id, metric_id, level, value_text, status, time_text,
       description, suggestion, action, result, note, triggered_at, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    a.id, a.poolId, a.metricId, a.level, a.valueText, a.status, a.timeText,
    a.description ?? "", a.suggestion ?? "", a.action ?? "", a.result ?? "", a.note ?? "",
    a.triggeredAt, a.closedAt ?? null,
  );
}

// 同 (pool_id, metric_id) 未关闭记录（B7 冷却去重用）。
export function findOpenByPoolMetric(
  db: Database,
  poolId: string,
  metricId: string,
): Row | undefined {
  return db
    .prepare(
      `SELECT * FROM alerts WHERE pool_id = ? AND metric_id = ? AND status != '已关闭'
       ORDER BY triggered_at DESC LIMIT 1`,
    )
    .get(poolId, metricId);
}

export interface AlertPatch {
  status?: string;
  note?: string;
  result?: string;
}

export function updateAlert(db: Database, id: string, patch: AlertPatch): boolean {
  const fields: string[] = [];
  const params: SqlParam[] = [];
  if (patch.status !== undefined) {
    fields.push("status = ?");
    params.push(patch.status);
    if (patch.status === "已关闭") {
      fields.push("closed_at = ?");
      params.push(Date.now());
    }
  }
  if (patch.note !== undefined) {
    fields.push("note = ?");
    params.push(patch.note);
  }
  if (patch.result !== undefined) {
    fields.push("result = ?");
    params.push(patch.result);
  }
  if (!fields.length) return false;
  params.push(id);
  const r = db
    .prepare(`UPDATE alerts SET ${fields.join(", ")} WHERE id = ?`)
    .run(...params);
  return r.changes > 0;
}

export function closeAlert(db: Database, id: string, result: string, closedAt: number): void {
  db.prepare("UPDATE alerts SET status = '已关闭', result = ?, closed_at = ? WHERE id = ?").run(
    result,
    closedAt,
    id,
  );
}

export function countOpen(db: Database): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE status != '已关闭'").get();
  return Number(row?.n ?? 0);
}

// 每池未关闭预警计数（育苗池详情页 / summary 用）。
export function countOpenByPool(db: Database): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT pool_id, COUNT(*) AS n FROM alerts WHERE status != '已关闭' GROUP BY pool_id`,
    )
    .all();
  const out: Record<string, number> = {};
  for (const row of rows) out[String(row.pool_id)] = Number(row.n);
  return out;
}
