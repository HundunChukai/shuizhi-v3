// 传感器数据接入适配器抽象（C8）。
// 目标：把「不同传输通道」（HTTP / MQTT / TCP …）与「统一入库口径」解耦——
//   任何通道收到的样本都汇入 SensorDataService.ingest()：校验 → 落库 → 阈值判定(告警) → 更新 last_seen。
//   新增一种设备协议只需实现一个 adapter（把协议报文解析成 SensorSample[] 再 deliver），
//   完全复用同一套入库/告警/去重逻辑，无需改动业务代码。
// 注意：Node type-stripping 不支持「参数属性」(constructor(private db))，故显式声明字段 + 构造器赋值
//   （与 simulator/engine.ts 的 SimulatorEngine 同一约定）。
import type { Database } from "../db/driver.ts";
import type { RecordSource } from "../repositories/waterQualityRepo.ts";
import {
  ingest,
  type IngestResult,
  type SensorSample,
} from "../services/sensorDataService.ts";

export interface IngestAdapter {
  // 通道标识（日志/诊断用），如 "http" | "mqtt" | "tcp"。
  readonly name: string;
  // 把一批（或单条）样本汇入统一入库口径，返回 accepted/rejected/items/errors。
  deliver(samples: SensorSample | SensorSample[]): IngestResult;
  // 推送型通道（MQTT/TCP）实现 start/stop 开始/停止监听；
  // 拉取型（HTTP，由 Express 路由驱动）用基类默认 no-op 即可。
  start?(): void;
  stop?(): void;
}

// 适配器基类：持有 db 与来源标记，deliver 统一委托 SensorDataService.ingest（单一入库口径）。
export class BaseIngestAdapter implements IngestAdapter {
  readonly name: string;
  protected db: Database;
  protected source: RecordSource;

  constructor(name: string, db: Database, source: RecordSource = "sensor") {
    this.name = name;
    this.db = db;
    this.source = source;
  }

  deliver(samples: SensorSample | SensorSample[]): IngestResult {
    return ingest(this.db, samples, this.source);
  }

  // 默认 no-op；推送型通道按需覆写。
  start(): void {}
  stop(): void {}
}
