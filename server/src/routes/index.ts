// 统一 API 路由（B5）。全部挂在 /api 前缀下，统一响应 { data, meta:{ source, generatedAt } }。
// 设计取舍：列表类端点把「数组」放在 data、分页/计数放在 meta —— 既满足契约的 items/total/page 语义，
// 又让前端 C2 的 useApiData(path, mockArray) 能零改动直接替换（data 即数组）。
// 路由保持薄：只做参数解析 + 调服务/仓储 + 组织响应；错误统一抛 ApiError 交错误中间件。
import { Router } from "express";
import type { Request, Response, NextFunction, Router as IRouter } from "express";
import type { Database } from "../db/driver.ts";
import type { SimulatorEngine } from "../simulator/engine.ts";
import { config } from "../config.ts";
import { ApiError } from "../lib/httpError.ts";
import { METRIC_LIST, METRIC_ORDER, STATUS_COLORS } from "../../../src/app/data/metrics.ts";
import { listPools, getPoolById } from "../repositories/poolsRepo.ts";
import { countOpenByPool } from "../repositories/alertsRepo.ts";
import { listSensors } from "../repositories/sensorsRepo.ts";
import { listDosing } from "../repositories/dosingRepo.ts";
import { listMonitoring } from "../repositories/monitoringRepo.ts";
import { latestForPool, historyForChart } from "../services/waterQualityService.ts";
import { listAlerts, listAlertGroups, getAlert, patchAlert } from "../services/alertService.ts";
import { getSummary } from "../services/summaryService.ts";
import { createDosingWithMonitoring, closeMonitoring } from "../services/dosingService.ts";
import { setDemoRun, demoRunActive } from "../simulator/demoBusiness.ts";
import { HttpAdapter } from "../ingest/index.ts";
import {
  SCENARIO_LABELS,
  SCENARIO_MODES,
  isScenarioMode,
} from "../simulator/scenario.ts";

export interface ApiContext {
  db: Database;
  engine: SimulatorEngine;
}

type SyncHandler = (req: Request, res: Response) => void;

// 同步处理器包装：捕获抛出（含 ApiError）转交错误中间件（node:sqlite 为同步，无需 async 包装）。
function wrap(fn: SyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      fn(req, res);
    } catch (err) {
      next(err);
    }
  };
}

type Source = "db" | "simulator";

function send(res: Response, data: unknown, source: Source = "db"): void {
  res.json({ data, meta: { source, generatedAt: Date.now() } });
}

function sendList(res: Response, items: unknown[], extra: Record<string, unknown> = {}): void {
  res.json({ data: items, meta: { source: "db", generatedAt: Date.now(), ...extra } });
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const intOr = (v: unknown, dflt: number): number => {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : dflt;
};
// 逗号分隔的多值参数（如 status=未处理,处理中）：代表「命中任一」；空/未传 → undefined。
const strList = (v: unknown): string[] | undefined => {
  const raw = str(v);
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
};

export function makeApiRouter(ctx: ApiContext): IRouter {
  const router = Router();
  const { db, engine } = ctx;
  // C8：HTTP 接入通道适配器（POST /api/sensor-data）；deliver 汇入统一入库口径 SensorDataService.ingest。
  const httpIngest = new HttpAdapter(db);

  // ── 存活 / 元信息 ────────────────────────────────────────────────────────
  router.get("/health", (_req, res) => {
    send(res, { ok: true, dataSource: config.dataSource, time: Date.now() });
  });

  router.get("/meta", (_req, res) => {
    send(res, {
      metrics: METRIC_LIST,
      metricOrder: METRIC_ORDER,
      statusColors: STATUS_COLORS,
      dataSource: config.dataSource,
      scenarios: engine.scenariosSnapshot(),
      scenarioLabels: SCENARIO_LABELS,
      scenarioModes: SCENARIO_MODES,
      simIntervalMs: config.simIntervalMs,
    });
  });

  // ── 育苗池 ──────────────────────────────────────────────────────────────
  router.get("/pools", wrap((_req, res) => {
    const pools = listPools(db);
    const openByPool = countOpenByPool(db);
    sendList(res, pools.map((p) => ({ ...p, openAlertCount: openByPool[p.id] ?? 0 })));
  }));

  router.get("/pools/:id", wrap((req, res) => {
    const pool = getPoolById(db, req.params.id);
    if (!pool) throw new ApiError(404, `未知育苗池: ${req.params.id}`);
    const readings = latestForPool(db, pool.id);
    const openAlertCount = countOpenByPool(db)[pool.id] ?? 0;
    send(res, { ...pool, readings, openAlertCount });
  }));

  // ── 水质：最新读数 / 历史曲线 ────────────────────────────────────────────
  router.get("/water-quality/latest", wrap((req, res) => {
    const poolId = str(req.query.poolId);
    if (!poolId) throw new ApiError(400, "缺少 poolId");
    sendList(res, latestForPool(db, poolId));
  }));

  router.get("/water-quality/history", wrap((req, res) => {
    const poolId = str(req.query.poolId);
    const metricId = str(req.query.metricId);
    if (!poolId || !metricId) throw new ApiError(400, "缺少 poolId 或 metricId");
    const range = str(req.query.range) ?? "24h";
    const limit = req.query.limit ? intOr(req.query.limit, 0) || undefined : undefined;
    const cursorRaw = req.query.cursor ? Number(req.query.cursor) : NaN;
    const cursor = Number.isFinite(cursorRaw) ? cursorRaw : undefined;
    const view = historyForChart(db, { poolId, metricId, range, limit, cursor });
    res.json({ data: view, meta: { source: "db", generatedAt: Date.now(), ...view.meta } });
  }));

  // ── 预警：查询 / 状态流转 ────────────────────────────────────────────────
  router.get("/alerts", wrap((req, res) => {
    const status = str(req.query.status);
    const poolId = str(req.query.poolId);
    const metricId = str(req.query.metricId);
    const from = req.query.from ? intOr(req.query.from, 0) : undefined;
    const to = req.query.to ? intOr(req.query.to, 0) : undefined;
    const page = req.query.page ? intOr(req.query.page, 1) : undefined;
    const pageSize = req.query.pageSize ? intOr(req.query.pageSize, 50) : undefined;
    const result = listAlerts(db, { status, poolId, metricId, from, to, page, pageSize });
    sendList(res, result.items, {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  }));

  // 事件组聚合（池 × 指标）：预警中心 L1 折叠列表的数据来源。
  // 状态/等级/时间范围走 HAVING（决定「哪些组入选」），不写进 WHERE，避免组内计数与状态分布失真。
  router.get("/alerts/groups", wrap((req, res) => {
    const statuses = strList(req.query.status);
    const poolId = str(req.query.poolId);
    const metricId = str(req.query.metricId);
    const level = str(req.query.level);
    const from = req.query.from ? intOr(req.query.from, 0) : undefined;
    const to = req.query.to ? intOr(req.query.to, 0) : undefined;
    const page = req.query.page ? intOr(req.query.page, 1) : undefined;
    const pageSize = req.query.pageSize ? intOr(req.query.pageSize, 20) : undefined;
    const result = listAlertGroups(db, { statuses, poolId, metricId, level, from, to, page, pageSize });
    sendList(res, result.items, {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  }));

  router.patch("/alerts/:id", wrap((req, res) => {
    if (!getAlert(db, req.params.id)) throw new ApiError(404, `未知预警: ${req.params.id}`);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const ok = patchAlert(db, req.params.id, {
      status: str(body.status),
      note: str(body.note),
      result: str(body.result),
    });
    if (!ok) throw new ApiError(400, "无可更新字段（status/note/result 至少其一）");
    send(res, getAlert(db, req.params.id));
  }));

  // ── 投放记录：读 / 写（B8 写时同建监测）──────────────────────────────────
  router.get("/dosing-records", wrap((req, res) => {
    sendList(res, listDosing(db, { poolId: str(req.query.poolId), agent: str(req.query.agent) }));
  }));

  router.post("/dosing-records", wrap((req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const out = createDosingWithMonitoring(db, {
      poolId: String(body.poolId ?? ""),
      agent: String(body.agent ?? ""),
      concentration: str(body.concentration),
      dosage: str(body.dosage),
      operator: String(body.operator ?? ""),
      result: str(body.result),
      note: str(body.note),
      duration: str(body.duration),
    });
    res.status(201).json({ data: out, meta: { source: "db", generatedAt: Date.now() } });
  }));

  // ── 投放后监测：读 / 收尾（B8）───────────────────────────────────────────
  router.get("/monitoring", wrap((req, res) => {
    sendList(res, listMonitoring(db, { poolId: str(req.query.poolId), taskId: str(req.query.taskId) }));
  }));

  router.post("/monitoring/:id/close", wrap((req, res) => {
    send(res, closeMonitoring(db, req.params.id));
  }));

  // ── 传感器清单 / 数据接入（C8 骨架）──────────────────────────────────────
  router.get("/sensors", wrap((req, res) => {
    sendList(res, listSensors(db, str(req.query.poolId)));
  }));

  router.post("/sensor-data", wrap((req, res) => {
    if (config.sensorToken) {
      const auth = String(req.headers.authorization ?? "");
      if (auth !== `Bearer ${config.sensorToken}`) throw new ApiError(401, "传感器令牌无效");
    }
    const body = req.body as unknown;
    const payload = Array.isArray(body)
      ? body
      : ((body as Record<string, unknown>)?.samples ?? body);
    const result = httpIngest.deliver(payload as never);
    if (result.accepted === 0) {
      throw new ApiError(400, result.errors.join("; ") || "无有效样本");
    }
    // 单样本：直接返回该条（含契约要求的 recordId / alertCreated）；批量：返回完整统计。
    const data =
      result.accepted === 1 && result.items.length === 1 ? result.items[0] : result;
    res.status(201).json({ data, meta: { source: "simulator", generatedAt: Date.now() } });
  }));

  // ── 汇总（P0-1 / P0-2 数据源）───────────────────────────────────────────
  router.get("/summary", wrap((_req, res) => {
    send(res, getSummary(db));
  }));

  // ── 演示：切换模拟器场景（切换即产一帧，使 GET latest/summary 立刻反映）──
  router.post("/demo/scenario", wrap((req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const scenario = body.scenario;
    if (!isScenarioMode(scenario)) {
      throw new ApiError(400, `未知场景: ${String(scenario)}（可选 ${SCENARIO_MODES.join(" / ")}）`);
    }
    const poolId = str(body.poolId);
    if (poolId && !getPoolById(db, poolId)) throw new ApiError(404, `未知育苗池: ${poolId}`);
    engine.setScenario(poolId, scenario);
    const tick = engine.tick();
    res.json({
      data: { scenario, poolId: poolId ?? null, scenarios: engine.scenariosSnapshot(), tick },
      meta: { source: "simulator", generatedAt: Date.now() },
    });
  }));

  // ── 演示：自动演示运行态心跳/开关（前端运行中周期上报；后端据此驱动投放→监测业务闭环）──
  router.post("/demo/run", wrap((req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    setDemoRun(body.running === true);
    send(res, { running: demoRunActive() });
  }));

  return router;
}
