// sensors 仓储：传感器清单读写（C8 传感器接入骨架的落点）。
import type { Database, Row } from "../db/driver.ts";

export type Sensor = {
  id: string;
  poolId: string;
  metricId: string;
  deviceName: string;
  unit: string;
  status: string;
  installedAt: number;
  lastSeenAt: number | null;
};

function mapSensor(row: Row): Sensor {
  return {
    id: String(row.id),
    poolId: String(row.pool_id),
    metricId: String(row.metric_id),
    deviceName: String(row.device_name),
    unit: String(row.unit),
    status: String(row.status),
    installedAt: Number(row.installed_at),
    lastSeenAt: row.last_seen_at == null ? null : Number(row.last_seen_at),
  };
}

export function listSensors(db: Database, poolId?: string): Sensor[] {
  const rows = poolId
    ? db.prepare("SELECT * FROM sensors WHERE pool_id = ? ORDER BY id").all(poolId)
    : db.prepare("SELECT * FROM sensors ORDER BY id").all();
  return rows.map(mapSensor);
}

export function findSensor(db: Database, poolId: string, metricId: string): Sensor | undefined {
  const row = db
    .prepare("SELECT * FROM sensors WHERE pool_id = ? AND metric_id = ? LIMIT 1")
    .get(poolId, metricId);
  return row ? mapSensor(row) : undefined;
}

// 按传感器 id 反查（POST /api/sensor-data 用 sensorId 上报时定位池/指标）。
export function getSensorById(db: Database, id: string): Sensor | undefined {
  const row = db.prepare("SELECT * FROM sensors WHERE id = ? LIMIT 1").get(id);
  return row ? mapSensor(row) : undefined;
}

export function touchSensor(db: Database, id: string, at: number): void {
  db.prepare("UPDATE sensors SET last_seen_at = ? WHERE id = ?").run(at, id);
}

// 模拟器每 tick 上报全部传感器，一条语句刷新 last_seen（避免 24 次单独 UPDATE）。
export function touchAllSensors(db: Database, at: number): void {
  db.prepare("UPDATE sensors SET last_seen_at = ?").run(at);
}
