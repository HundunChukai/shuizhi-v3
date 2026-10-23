#!/usr/bin/env node
// 后端启动器（纯 JS，随 node 直接运行，不进入前端构建）。
// 职责：
//   1) 版本门槛：Node ≥ 22.13；
//   2) 按版本注入启动期 flag（22.x/23.x 早期需要 --experimental-sqlite / --experimental-strip-types），
//      这些 flag 必须由 node 进程参数给定，故通过一次「自 respawn」下发；Node ≥23.6（含 24.x）免 flag；
//   3) 静默 ExperimentalWarning；
//   4) 注册 .ts 解析钩子：让「无扩展名的相对导入」解析到 .ts —— 使后端可直接复用前端
//      src/app/data/*.ts（这些文件内部用 `from "./metrics"` 无扩展名写法，Node ESM 默认无法解析）；
//   5) --selftest：仅验证 node:sqlite 能力后退出。

import { spawn } from "node:child_process";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const argv = process.argv.slice(2);
const [major, minor] = process.versions.node.split(".").map(Number);

// ── 版本门槛 ──────────────────────────────────────────────────────────────
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(
    `当前 Node ${process.versions.node} 过旧，请升级 Node ≥ 22.13（推荐 24.x）后重试。`,
  );
  process.exit(1);
}

const needsSqliteFlag = major < 23 || (major === 23 && minor < 4);
const needsStripFlag = major < 23 || (major === 23 && minor < 6);
const respawned = process.env.__AQUA_SERVER_RESPAWNED === "1";

if ((needsSqliteFlag || needsStripFlag) && !respawned) {
  // 需要启动期 flag：respawn 一次，把 flag 交给子进程，并转发信号/退出码。
  const flags = [];
  if (needsSqliteFlag) flags.push("--experimental-sqlite");
  if (needsStripFlag) flags.push("--experimental-strip-types");
  flags.push("--disable-warning=ExperimentalWarning");
  const child = spawn(
    process.execPath,
    [...flags, fileURLToPath(import.meta.url), ...argv],
    {
      stdio: "inherit",
      env: { ...process.env, __AQUA_SERVER_RESPAWNED: "1" },
    },
  );
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
} else {
  // 免 flag（Node ≥23.6，含 24.x）或已 respawn：静默实验性警告后继续。
  process.removeAllListeners("warning");
  process.on("warning", (w) => {
    if (w?.name !== "ExperimentalWarning") console.warn(w);
  });

  // --selftest：验证 node:sqlite 可用后退出（B2 验收点：输出 "sqlite ok"）。
  if (argv.includes("--selftest")) {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE t (a INTEGER); INSERT INTO t VALUES (1);");
    const row = db.prepare("SELECT a FROM t").get();
    db.close();
    const ok = Number(row?.a) === 1;
    console.log(ok ? "sqlite ok" : "sqlite FAILED");
    process.exit(ok ? 0 : 1);
  }

  // .ts 解析钩子（见文件头说明）。仅改写「相对且无扩展名」的 specifier，
  // 裸模块（express/cors）与已带扩展名（.js/.ts/.json）一律透传，安全。
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const isRelative =
        specifier.startsWith("./") || specifier.startsWith("../");
      const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier);
      if (isRelative && !hasExtension) {
        try {
          return nextResolve(`${specifier}.ts`, context);
        } catch {}
        try {
          return nextResolve(`${specifier}/index.ts`, context);
        } catch {}
      }
      return nextResolve(specifier, context);
    },
  });

  const here = path.dirname(fileURLToPath(import.meta.url));
  // --fake-sensor：运行传感器模拟上报脚本（验证 POST /api/sensor-data 全链路），不启动服务器。
  if (argv.includes("--fake-sensor")) {
    await import(pathToFileURL(path.resolve(here, "fake-sensor.ts")).href);
  } else {
    const entry = pathToFileURL(path.resolve(here, "../src/index.ts")).href;
    await import(entry);
  }
}
