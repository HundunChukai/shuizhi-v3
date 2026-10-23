// 后端入口（B5–B11）：建库 → 迁移 → seed → 首启回填 → 保留期清理 → 启动 HTTP + 模拟器 → 优雅关停。
// --reset：删除并重建数据库后退出（npm run db:reset，不启动服务）。
// --static / NODE_ENV=production：单端口同源托管 dist + API（npm run serve）。
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import http from "node:http";
import { config } from "./config.ts";
import { openDb, type Database } from "./db/driver.ts";
import { migrate } from "./db/migrate.ts";
import { seed } from "./db/seed.ts";
import { createApp } from "./app.ts";
import { SimulatorEngine } from "./simulator/engine.ts";
import { demoBusinessTick } from "./simulator/demoBusiness.ts";
import { deleteOlderThan } from "./repositories/waterQualityRepo.ts";

const argv = process.argv.slice(2);
const isReset = argv.includes("--reset");
const serveStatic = argv.includes("--static") || config.nodeEnv === "production";

// --reset：删除 db 及 WAL/SHM 边车文件（Windows 下若被占用会失败，提示先停服务）。
if (isReset) {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${config.dbPath}${suffix}`, { force: true });
    } catch (err) {
      console.warn(
        `[db] 无法删除 ${config.dbPath}${suffix}（可能有进程占用，请先停止 server）：${(err as Error).message}`,
      );
    }
  }
  console.log(`[db] reset: removed ${config.dbPath}*`);
}

mkdirSync(path.dirname(config.dbPath), { recursive: true });
const db: Database = openDb(config.dbPath);
const tables = migrate(db);
console.log(`[db] path: ${config.dbPath}`);
console.log(`[db] migrated ${tables.length} tables: ${tables.join(", ")}`);

const seedResult = seed(db);
console.log(
  seedResult.seeded
    ? `[seed] inserted → ${JSON.stringify(seedResult.counts)}`
    : `[seed] skipped (already seeded) → ${JSON.stringify(seedResult.counts)}`,
);

// B6：模拟器 + 首启回填（时序表为空时生成 24h/10min 历史，避免前端图表首启空白）。
const engine = new SimulatorEngine(db);
engine.hydrateFromDb(); // 重启续接：用最新读数填充游走状态（空表时为 no-op）
const backfilled = engine.backfill24h();
if (backfilled > 0) console.log(`[sim] backfilled ${backfilled} history rows (24h @10min)`);

// B10：保留期清理（启动时 + 每小时），控制时序表体积。
function cleanup(): void {
  const cutoff = Date.now() - config.retentionDays * 86_400_000;
  const removed = deleteOlderThan(db, cutoff);
  if (removed > 0) {
    console.log(`[db] retention: removed ${removed} rows older than ${config.retentionDays}d`);
  }
}
cleanup();

// --reset：仅重建数据库后退出，不启动服务。
if (isReset) {
  db.close();
  console.log("[db] reset complete.");
  process.exit(0);
}

const app = createApp({ db, engine, serveStatic });
const server = http.createServer(app);

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[server] 端口 ${config.port} 已被占用。请关闭占用进程，或用 PORT=<其他端口> 重试。`,
    );
    process.exit(1);
  }
  throw err;
});

server.listen(config.port, () => {
  console.log(`[server] 贝类育苗水质监测平台后端已启动： http://localhost:${config.port}`);
  console.log(
    `[server] 数据源=${config.dataSource}  静态托管=${serveStatic ? config.distPath : "关闭"}  tick=${config.simIntervalMs}ms`,
  );
  console.log(`[server] 健康检查： http://localhost:${config.port}/api/health`);
});

// B6/B7：定时 tick —— 每 SIM_INTERVAL_MS 生成一帧、单事务批写、阈值联动 alerts；
// 自动演示运行中额外驱动「投放→监测→收尾」业务闭环（demoBusiness，心跳超时自动停摆）。
const tickTimer = setInterval(() => {
  const r = engine.tick();
  const b = demoBusinessTick(db);
  console.log(
    `[sim] tick +${r.inserted} rows, alerts +${r.alertsCreated}/-${r.alertsClosed}` +
      (b.dosingCreated || b.monitoringClosed
        ? `, demo-business dosing+${b.dosingCreated}/monitoring-${b.monitoringClosed}`
        : ""),
  );
}, config.simIntervalMs);

const cleanupTimer = setInterval(cleanup, 3_600_000);

// B11：优雅关停（清 interval + 关 server + 关 db），避免 WAL 损坏 / database is locked。
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[server] ${signal} received, shutting down...`);
  clearInterval(tickTimer);
  clearInterval(cleanupTimer);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    console.log("[server] closed. bye.");
    process.exit(0);
  });
  // 兜底：3s 内未正常关闭则强制退出。
  setTimeout(() => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  }, 3000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException:", err);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandledRejection:", reason);
});
