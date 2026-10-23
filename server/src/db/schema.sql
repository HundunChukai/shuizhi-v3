-- 贝类育苗水质监测平台 · 数据库 Schema（6 表，幂等：IF NOT EXISTS）
--
-- 设计原则：
--  1) 字段对齐 src/app/data/*.ts 前端类型，保证 GET 接口与前端 fallback「逐字段一致」。
--  2) seed 行额外保存「展示用字符串」（*_text 列）与 JSON 列（before/after_metrics），
--     以便原样回放前端 mock 的展示值（如 "今天 18:02" / "0.18 mg/L"）。
--  3) 同时保留结构化列（epoch 毫秒、metric_id、value REAL），供模拟器、查询、保留期清理使用。
--  4) 时间统一用 INTEGER epoch 毫秒（更小、比较/排序更快）。
--  5) 连接级 PRAGMA（WAL / synchronous / busy_timeout / foreign_keys）在 migrate.ts 每次打开时设置。

-- ── 育苗池主数据（对齐 Pool 类型）────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pools (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  species      TEXT NOT NULL,
  batch        TEXT NOT NULL,
  stage        TEXT NOT NULL,
  status       TEXT NOT NULL,
  start_date   TEXT NOT NULL,
  density      TEXT NOT NULL,
  water_volume TEXT NOT NULL,
  manager      TEXT NOT NULL,
  description  TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

-- ── 传感器清单（每池每指标一个；C8 传感器接入骨架的落点）────────────────
CREATE TABLE IF NOT EXISTS sensors (
  id           TEXT PRIMARY KEY,
  pool_id      TEXT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  metric_id    TEXT NOT NULL,
  device_name  TEXT NOT NULL,
  unit         TEXT NOT NULL,
  status       TEXT NOT NULL,
  installed_at INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sensors_pool ON sensors(pool_id);

-- ── 水质时序主表（增长最快；复合索引服务 latest / history / 保留期清理）──
CREATE TABLE IF NOT EXISTS water_quality_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id     TEXT NOT NULL,
  sensor_id   TEXT,
  metric_id   TEXT NOT NULL,
  value       REAL NOT NULL,
  status      TEXT NOT NULL,
  scenario    TEXT NOT NULL DEFAULT 'normal',
  source      TEXT NOT NULL DEFAULT 'demo' CHECK (source IN ('demo','live','sensor')),
  recorded_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wqr_pool_metric_time
  ON water_quality_records(pool_id, metric_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_wqr_recorded_at
  ON water_quality_records(recorded_at);

-- ── 异常预警（对齐 AlertRecord 类型）────────────────────────────────────
-- value_text/time_text 为展示字符串；triggered_at/closed_at 为 epoch，用于排序与去重。
CREATE TABLE IF NOT EXISTS alerts (
  id           TEXT PRIMARY KEY,
  pool_id      TEXT NOT NULL,
  metric_id    TEXT NOT NULL,
  level        TEXT NOT NULL,
  value_text   TEXT NOT NULL,
  status       TEXT NOT NULL,
  time_text    TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  suggestion   TEXT NOT NULL DEFAULT '',
  action       TEXT NOT NULL DEFAULT '',
  result       TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  triggered_at INTEGER NOT NULL,
  closed_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_alerts_pool_status_time
  ON alerts(pool_id, status, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_metric_open
  ON alerts(pool_id, metric_id, status);

-- ── 投放记录台账（对齐 DosingRecord 类型；无 judgment 决策字段）─────────
CREATE TABLE IF NOT EXISTS dosing_records (
  id            TEXT PRIMARY KEY,
  pool_id       TEXT NOT NULL,
  batch         TEXT NOT NULL DEFAULT '',
  agent         TEXT NOT NULL,
  concentration TEXT NOT NULL,
  dosage        TEXT NOT NULL,
  operator      TEXT NOT NULL,
  result        TEXT NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  time_text     TEXT NOT NULL,
  dosed_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dosing_pool_time
  ON dosing_records(pool_id, dosed_at DESC);

-- ── 投放后监测（对齐 MonitoringTask 类型；before/after_metrics 存 JSON）──
CREATE TABLE IF NOT EXISTS monitoring_records (
  id               TEXT PRIMARY KEY,
  pool_id          TEXT NOT NULL,
  dosing_record_id TEXT,
  agent            TEXT NOT NULL,
  concentration    TEXT NOT NULL DEFAULT '',
  dosage           TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL,
  result           TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  duration         TEXT NOT NULL DEFAULT '',
  conclusion       TEXT NOT NULL DEFAULT '',
  recovery         TEXT NOT NULL DEFAULT '',
  before_metrics   TEXT NOT NULL DEFAULT '[]',
  after_metrics    TEXT NOT NULL DEFAULT '[]',
  start_time_text  TEXT NOT NULL,
  started_at       INTEGER NOT NULL,
  measured_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_monitoring_dosing
  ON monitoring_records(dosing_record_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_pool_time
  ON monitoring_records(pool_id, started_at DESC);
