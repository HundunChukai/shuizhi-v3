// 后端运行配置：端口 / DB 路径 / 模拟间隔 / 保留期 / 数据源 / 传感器令牌。
// 零依赖读取 server/.env（存在则载入，不覆盖已有环境变量），无 .env 时用默认值。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url)); // server/src
export const serverRoot = path.resolve(here, ".."); // server/
export const repoRoot = path.resolve(serverRoot, ".."); // 仓库根

// 极简 .env 解析（避免引入 dotenv 依赖）：KEY=VALUE，支持 # 注释与引号包裹。
function loadEnvFile(file: string): void {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return; // .env 不存在则忽略
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(path.resolve(serverRoot, ".env"));

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export type DataSource = "demo" | "live";

export const config = {
  port: intFromEnv("PORT", 8787),
  dbPath: process.env.DB_PATH || path.resolve(serverRoot, "data", "aqua.db"),
  // tick clamp 到 10–30s（对齐需求⑨「每 10~30 秒写库」）；默认 10s 保证自动演示画面实时感
  simIntervalMs: Math.min(30000, Math.max(10000, intFromEnv("SIM_INTERVAL_MS", 10000))),
  retentionDays: Math.max(1, intFromEnv("RETENTION_DAYS", 7)),
  dataSource: (process.env.DATA_SOURCE === "live" ? "live" : "demo") as DataSource,
  sensorToken: process.env.SENSOR_TOKEN ?? "",
  distPath: path.resolve(repoRoot, "dist"),
  nodeEnv: process.env.NODE_ENV ?? "development",
} as const;
