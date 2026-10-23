// Express 应用装配（B5）：cors + json + 请求日志 + /api 路由 + 生产静态托管 dist + 统一错误处理。
import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
import { config } from "./config.ts";
import { makeApiRouter, type ApiContext } from "./routes/index.ts";
import { ApiError } from "./lib/httpError.ts";

export interface AppOptions extends ApiContext {
  serveStatic?: boolean;
}

export function createApp(opts: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "1mb" }));

  // 请求日志（一行：方法 路径 状态 耗时）。
  app.use((req: Request, res: Response, next: NextFunction) => {
    const started = Date.now();
    res.on("finish", () => {
      console.log(`[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  });

  app.use("/api", makeApiRouter(opts));

  // 生产 / 单端口同源：托管前端 dist + hash 路由回落 index.html（消除 CORS）。
  if (opts.serveStatic) {
    if (existsSync(config.distPath)) {
      app.use(express.static(config.distPath));
      app.get("*", (req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith("/api")) return next();
        res.sendFile(path.join(config.distPath, "index.html"));
      });
    } else {
      console.warn(`[http] --static 指定但 dist 不存在：${config.distPath}（请先 npm run build）`);
    }
  }

  // /api 未匹配 → 404 JSON（避免落回 index.html）。
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      res.status(404).json({
        error: `未知接口: ${req.method} ${req.originalUrl}`,
        meta: { generatedAt: Date.now() },
      });
      return;
    }
    next();
  });

  // 统一错误处理（ApiError 带 statusCode；其余 500）。express 靠 4 参签名识别错误中间件。
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof ApiError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Internal Server Error";
    if (status >= 500) console.error("[api error]", err);
    if (res.headersSent) return;
    res.status(status).json({ error: message, meta: { generatedAt: Date.now() } });
  });

  return app;
}
