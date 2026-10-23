// dosing_records 仓储：投放记录台账读写。行 → 前端 DosingRecord 类型（JOIN pools 取池名/品种）。
import type { Database, Row, SqlParam } from "../db/driver.ts";
import type { DosingRecord } from "../../../src/app/data/dosingRecords.ts";

function mapDosing(row: Row): DosingRecord {
  return {
    id: String(row.id),
    poolId: String(row.pool_id),
    pool: String(row.pool_name ?? ""),
    species: String(row.species ?? ""),
    batch: String(row.batch ?? ""),
    time: String(row.time_text),
    agent: String(row.agent),
    concentration: String(row.concentration),
    dosage: String(row.dosage),
    operator: String(row.operator),
    result: String(row.result),
  };
}

const SELECT_JOIN = `
  SELECT d.*, p.name AS pool_name, p.species AS species
  FROM dosing_records d LEFT JOIN pools p ON p.id = d.pool_id`;

export function listDosing(
  db: Database,
  opts: { poolId?: string; agent?: string } = {},
): DosingRecord[] {
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (opts.poolId) {
    where.push("d.pool_id = ?");
    params.push(opts.poolId);
  }
  if (opts.agent) {
    where.push("d.agent = ?");
    params.push(opts.agent);
  }
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  return db
    .prepare(`${SELECT_JOIN}${whereSql} ORDER BY d.dosed_at DESC, d.rowid DESC`)
    .all(...params)
    .map(mapDosing);
}

export function getDosingById(db: Database, id: string): DosingRecord | undefined {
  const row = db.prepare(`${SELECT_JOIN} WHERE d.id = ?`).get(id);
  return row ? mapDosing(row) : undefined;
}

export interface NewDosing {
  id: string;
  poolId: string;
  batch: string;
  agent: string;
  concentration: string;
  dosage: string;
  operator: string;
  result: string;
  note?: string;
  timeText: string;
  dosedAt: number;
}

export function insertDosing(db: Database, d: NewDosing): void {
  db.prepare(
    `INSERT INTO dosing_records (id, pool_id, batch, agent, concentration, dosage, operator, result, note, time_text, dosed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    d.id, d.poolId, d.batch, d.agent, d.concentration, d.dosage,
    d.operator, d.result, d.note ?? "", d.timeText, d.dosedAt,
  );
}
