// MQTT 通道适配器骨架（C8：预留，未接线，不影响 HTTP 链路）。
// 用途：接入真实 MQTT broker（如 mqtt.js / aedes），订阅设备上报主题，把消息解析为 SensorSample[]
//   后调用 this.deliver(samples) —— 与 HTTP 通道共用同一入库/告警/去重口径，无需改动业务逻辑。
// 现状：start/stop 为占位 no-op；刻意不引入任何第三方依赖，以保持「clone 即运行、低摩擦」。
import type { Database } from "../db/driver.ts";
import type { RecordSource } from "../repositories/waterQualityRepo.ts";
import { BaseIngestAdapter } from "./adapter.ts";

export class MqttAdapter extends BaseIngestAdapter {
  constructor(db: Database, source: RecordSource = "sensor") {
    super("mqtt", db, source);
  }

  start(): void {
    // TODO(C8+): 接线真实 MQTT broker —— 需要时再 `npm i mqtt`（作为可选依赖）：
    //   1) import mqtt from "mqtt";
    //   2) const client = mqtt.connect(process.env.MQTT_URL ?? "mqtt://localhost:1883");
    //   3) client.subscribe(process.env.MQTT_TOPIC ?? "aqua/+/+/reading");
    //   4) client.on("message", (_topic, buf) => {
    //        const samples = parseMqttPayload(buf);   // 设备协议(JSON/自定义) → SensorSample[]
    //        this.deliver(samples);                   // 汇入统一入库口径
    //      });
    //   5) 把 client 存到实例字段，供 stop() 关闭。
  }

  stop(): void {
    // TODO(C8+): client.end()、取消订阅、清理定时器/句柄。
  }
}

// TODO(C8+): parseMqttPayload(buf) —— 按实际设备协议实现（示例：JSON.parse + 字段映射到 SensorSample）。
