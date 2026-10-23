// HTTP 通道适配器 = POST /api/sensor-data（C8：已实现并接线）。
// 拉取型：由 Express 路由（routes/index.ts）接收请求体后交给 deliver()，无需自启监听，
//   start/stop 用基类默认 no-op。这是当前唯一在运行的接入通道。
import type { Database } from "../db/driver.ts";
import type { RecordSource } from "../repositories/waterQualityRepo.ts";
import { BaseIngestAdapter } from "./adapter.ts";

export class HttpAdapter extends BaseIngestAdapter {
  constructor(db: Database, source: RecordSource = "sensor") {
    super("http", db, source);
  }
}
