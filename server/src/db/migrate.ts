// 幂等迁移：设置连接级 PRAGMA + 执行 schema.sql（全部 IF NOT EXISTS）。
// 返回当前业务表名列表（供启动日志与 B3 验收「打印 6 表名」）。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Database } from "./driver.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(here, "schema.sql");

export const BUSINESS_TABLES = [
  "pools",
  "sensors",
  "water_quality_records",
  "alerts",
  "dosing_records",
  "monitoring_records",
] as const;

export function migrate(db: Database): string[] {
  // 连接级 PRAGMA（每次打开都要设；journal_mode=WAL 亦持久化到 db 文件）。
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");

  // DDL（幂等）。
  db.exec(readFileSync(schemaPath, "utf8"));

  // 返回实际存在的业务表名（按 schema 定义顺序，便于稳定打印）。
  const existing = new Set(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all()
      .map((row) => String(row.name)),
  );
  return BUSINESS_TABLES.filter((name) => existing.has(name));
}
