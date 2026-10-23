// 传感器接入适配器统一出口（C8）。
// HttpAdapter 已接线并运行（POST /api/sensor-data，见 routes/index.ts）；
// MqttAdapter / TcpAdapter 为预留骨架 + TODO，接线真实设备协议时再实现 start/stop。
// 三者都继承 BaseIngestAdapter，deliver() 统一汇入 SensorDataService.ingest（单一入库口径）。
export { BaseIngestAdapter } from "./adapter.ts";
export type { IngestAdapter } from "./adapter.ts";
export { HttpAdapter } from "./httpAdapter.ts";
export { MqttAdapter } from "./mqttAdapter.ts";
export { TcpAdapter } from "./tcpAdapter.ts";
