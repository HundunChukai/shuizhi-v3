// pools 仓储：唯一直接读写 pools 表处；行 → 前端 Pool 类型（camelCase）映射。
import type { Database, Row } from "../db/driver.ts";
import type { Pool } from "../../../src/app/data/pools.ts";
import type { MetricStatus } from "../../../src/app/data/metrics.ts";

function mapPool(row: Row): Pool {
  return {
    id: String(row.id),
    name: String(row.name),
    species: String(row.species),
    batch: String(row.batch),
    stage: String(row.stage),
    status: String(row.status) as MetricStatus,
    startDate: String(row.start_date),
    density: String(row.density),
    waterVolume: String(row.water_volume),
    manager: String(row.manager),
    description: String(row.description),
  };
}

export function listPools(db: Database): Pool[] {
  return db.prepare("SELECT * FROM pools ORDER BY id").all().map(mapPool);
}

export function getPoolById(db: Database, id: string): Pool | undefined {
  const row = db.prepare("SELECT * FROM pools WHERE id = ?").get(id);
  return row ? mapPool(row) : undefined;
}

export function updatePoolStatus(db: Database, id: string, status: MetricStatus): void {
  db.prepare("UPDATE pools SET status = ? WHERE id = ?").run(status, id);
}
