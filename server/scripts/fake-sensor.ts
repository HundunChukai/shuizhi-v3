// 传感器数据模拟上报脚本（C8）。
// 每 FAKE_SENSOR_INTERVAL_MS（默认 5s）向 POST /api/sensor-data 上报一批样本，
// 验证「传感器 → HTTP 接口(HttpAdapter) → SensorDataService.ingest → SQLite → 业务 API → 前端」全链路闭环。
// 运行：npm run fake-sensor（= node server/scripts/start.mjs --fake-sensor，自动按 Node 版本注入所需 flag）。
// 仅用 Node 内建 fetch，无需数据库/第三方依赖；Ctrl+C 退出。
//
// 可调环境变量：
//   SENSOR_BASE_URL         后端地址，默认 http://localhost:8787
//   FAKE_SENSOR_INTERVAL_MS 上报间隔毫秒，默认 5000（建议 3000–10000）
//   SENSOR_TOKEN            后端 config.sensorToken 非空时必须一致（否则 401）

const BASE = process.env.SENSOR_BASE_URL ?? "http://localhost:8787";
const INTERVAL_MS = Number(process.env.FAKE_SENSOR_INTERVAL_MS ?? "5000");
const TOKEN = process.env.SENSOR_TOKEN ?? "";

// 轮流上报 4 池 × 6 指标；每 4 个 tick 制造一次温度越阈，验证阈值联动生成 alert（并演示同池同指标冷却去重）。
const POOL_IDS = ["pool-1", "pool-2", "pool-3", "pool-4"];
const METRIC_SEEDS = [
  { id: "temperature", base: 22, jitter: 0.6, spike: 6 }, // spike→28℃，明显越异常阈值
  { id: "ph", base: 8.1, jitter: 0.08, spike: 0 },
  { id: "dissolved-oxygen", base: 7.5, jitter: 0.3, spike: 0 },
  { id: "salinity", base: 30, jitter: 0.5, spike: 0 },
  { id: "turbidity", base: 2.5, jitter: 0.5, spike: 0 },
  { id: "ammonia-nitrogen", base: 0.08, jitter: 0.03, spike: 0 },
];

interface Sample {
  poolId: string;
  metricId: string;
  value: number;
}

let tick = 0;

function buildSamples(): Sample[] {
  const doSpike = tick % 4 === 0;
  return METRIC_SEEDS.map((m, i) => {
    const poolId = POOL_IDS[(tick + i) % POOL_IDS.length];
    const noise = (Math.random() - 0.5) * 2 * m.jitter;
    const value = doSpike && m.spike > 0 ? m.base + m.spike : m.base + noise;
    return { poolId, metricId: m.id, value: Number(value.toFixed(3)) };
  });
}

async function report(): Promise<void> {
  tick += 1;
  const samples = buildSamples();
  try {
    const res = await fetch(`${BASE}/api/sensor-data`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
      body: JSON.stringify(samples),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: {
        accepted?: number;
        rejected?: number;
        items?: Array<{ alertCreated?: boolean }>;
      };
    };
    const d = json.data ?? {};
    const alerts = (d.items ?? []).filter((it) => it.alertCreated).length;
    console.log(
      `[fake-sensor] tick ${tick} → HTTP ${res.status} accepted=${d.accepted ?? 0} rejected=${d.rejected ?? 0} alertsCreated=${alerts}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[fake-sensor] tick ${tick} 上报失败：${msg}（后端是否已启动？先跑 npm run server）`,
    );
  }
}

console.log(
  `[fake-sensor] 每 ${INTERVAL_MS}ms 向 ${BASE}/api/sensor-data 上报 6 条样本；Ctrl+C 退出。`,
);
void report();
const timer = setInterval(() => {
  void report();
}, INTERVAL_MS);

process.on("SIGINT", () => {
  clearInterval(timer);
  console.log("\n[fake-sensor] 已停止。");
  process.exit(0);
});
