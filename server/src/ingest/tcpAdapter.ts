// TCP 通道适配器骨架（C8：预留，未接线，不影响 HTTP 链路）。
// 用途：以 Node 内建 net.createServer 监听端口，接收设备通过 TCP 上报的字节流，按行/长度帧解析为
//   SensorSample[] 后调用 this.deliver(samples) —— 与 HTTP/MQTT 共用同一入库/告警/去重口径。
// 现状：start/stop 为占位 no-op；仅依赖 Node 内建 net，无第三方依赖。
import type { Database } from "../db/driver.ts";
import type { RecordSource } from "../repositories/waterQualityRepo.ts";
import { BaseIngestAdapter } from "./adapter.ts";

export class TcpAdapter extends BaseIngestAdapter {
  constructor(db: Database, source: RecordSource = "sensor") {
    super("tcp", db, source);
  }

  start(): void {
    // TODO(C8+): 接线 TCP 监听 —— 仅用 Node 内建模块：
    //   1) import net from "node:net";
    //   2) const server = net.createServer((socket) => {
    //        let buf = "";
    //        socket.on("data", (chunk) => {
    //          buf += chunk.toString("utf8");
    //          const frames = buf.split("\n");        // 以换行分帧（或按设备协议定长/分隔符）
    //          buf = frames.pop() ?? "";              // 末尾半帧留到下次
    //          for (const line of frames) {
    //            const samples = parseTcpFrame(line); // 单帧 → SensorSample[]
    //            if (samples.length) this.deliver(samples);
    //          }
    //        });
    //      });
    //   3) server.listen(Number(process.env.TCP_PORT ?? 9009));
    //   4) 把 server 存到实例字段，供 stop() 关闭。
  }

  stop(): void {
    // TODO(C8+): server.close()、断开所有活动 socket、清理句柄。
  }
}

// TODO(C8+): parseTcpFrame(line) —— 按实际设备协议实现（示例：JSON.parse 或 "poolId,metricId,value" CSV）。
