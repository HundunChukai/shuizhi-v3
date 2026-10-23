# shuizhi-v3 · 贝类育苗水质监测平台

本仓库保存蓝白海洋风 V3：顶部固定导航、浅色业务面板、统一介绍页、紧凑半圆仪表及首次访问启动动画。保留现有业务功能与数据接口。

面向贝类育苗场景的水质监测全栈系统：实时采集六项水质指标（水温 / pH / 溶解氧 / 盐度 / 浊度 / 氨氮），
提供综合驾驶舱、异常预警中心、育苗池管理、投放记录与投放后监测五大后台页面。

完整数据链路：

```
传感器 ──POST /api/sensor-data──▶ 后端服务(Express) ──▶ SQLite(node:sqlite) ──▶ 业务 API ──▶ React 前端
                                       ▲                                              │
                                       └──────────── 模拟数据生成器(每 10~30s 写库) ───┘   （前端 API 不可达时自动降级到内置模拟数据）
```

设计原则：**clone 即运行、低摩擦**（后端零原生编译）、**始终保留纯静态可用版本**（无后端自动降级）、
**单一数据源**（指标/阈值/池数据只存一份，后端 seed 直接复用前端 `.ts`）。

---

## 环境要求

- **Node ≥ 22.13**（**推荐 24.x**）。后端使用 Node 内建 `node:sqlite`（零原生编译）+ 原生 TypeScript type-stripping 直接运行 `.ts`，无需构建步骤。
- 无需 Python / VS Build Tools / node-gyp。
- 前端：Vite 8 + React 19 + TypeScript 5。

---

## 快速开始

```bash
# 0) 安装前端依赖（仓库根，不含 server 依赖）
npm install

# 方式一：前后端分离开发（推荐日常开发）
npm run server     # 起后端 API + 模拟器（默认 :8787，自动建表/seed/每 15s 写库）
npm run dev        # 起前端 Vite（:5173，/api 已代理到 :8787，无 CORS）
                   # 打开 http://localhost:5173/#/main

# 方式二：单端口同源（最省事，前端 + API 同一端口，无 CORS）
npm run build      # 构建前端静态产物到 dist
npm run serve      # 后端同时托管 dist 与 API → 打开 http://localhost:8787/#/main

# 纯静态演示（无后端，如 GitHub Pages / 离线 / file://）
npm run build
npm run preview    # 打开 http://localhost:4173/#/main，API 不可达时自动降级到内置模拟数据，全功能可看

# 首次使用后端需安装其依赖（仅 express + cors，纯 JS，无原生编译）
cd server && npm install && cd ..
```

> `cd server && npm install` 只在需要运行后端时执行一次；纯静态演示 / GitHub Pages 部署**无需**安装 server 依赖。

### 其它常用命令

```bash
npm run db:reset      # 清空并重建数据库（删除 server/data/aqua.db* 后重新迁移 + seed）
npm run fake-sensor   # 启动模拟传感器：每 5s 向 POST /api/sensor-data 上报，验证传感器→接口→DB→告警全链路
```

---

## 可用脚本

**仓库根 `package.json`**（前端 + 后端启动入口，只加脚本不加依赖）：

| 脚本 | 说明 |
|---|---|
| `npm run dev` | Vite 开发服务器（:5173，`/api` 代理到 :8787） |
| `npm run build` | `tsc --noEmit && vite build`，产物到 `dist` |
| `npm run preview` | 预览 `dist`（纯静态，自动降级） |
| `npm run server` | 启动后端 API + 模拟器（:8787） |
| `npm run serve` | 单端口同源托管 `dist` + API（:8787） |
| `npm run db:reset` | 重建数据库 |
| `npm run fake-sensor` | 模拟传感器上报（验证接入链路） |

**`server/package.json`**：`start` / `dev`（`--watch`）/ `selftest`（验证 `node:sqlite` 可用）/ `fake-sensor` / `typecheck`。

---

## 环境变量

后端读取 `server/.env`（不存在则用默认值；参见 `server/.env.example`，`.env` 已被 gitignore）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8787` | 后端 HTTP 端口（Vite 代理与单端口托管均指向此端口） |
| `DB_PATH` | `server/data/aqua.db` | SQLite 文件路径 |
| `SIM_INTERVAL_MS` | `15000` | 模拟器写库间隔，运行时 clamp 到 `10000–30000`（对齐「每 10~30 秒写库」） |
| `RETENTION_DAYS` | `7` | 原始时序数据保留天数，超期行由清理任务删除 |
| `DATA_SOURCE` | `demo` | 后端默认数据源：`demo`（演示/模拟）\| `live`（实时/传感器） |
| `SENSOR_TOKEN` | 空 | `POST /api/sensor-data` 的 Bearer 令牌；留空表示不校验 |

前端（可选）：`VITE_API_BASE_URL` —— API 基址，默认 `/api`（dev 走 Vite 代理、生产走同源）。

---

## 数据源与演示场景

前端右上角（驾驶舱「数据源」卡片）可切换两种数据源，选择持久化在浏览器（默认 **演示**）：

- **演示数据源（demo，默认）**：后端在线时走真实链路（切场景会 `POST /api/demo/scenario` 驱动模拟器并回读 API）；
  后端不可达时用客户端内置数据本地生成，chip 显示「内置模拟数据」。GitHub Pages 上即为此模式。
- **实时数据源（live）**：只读 `/api/*`（数据来自 `POST /api/sensor-data`），每 15s 轮询；页面隐藏时暂停轮询、
  连续失败指数退避；接口不可达时自动降级到内置模拟数据，chip 显示「内置模拟数据」。

四个演示场景（对齐模拟器的 `SCENARIO_MODES`）：**当前状态 / 预警 / 异常 / 恢复中**。切换场景时，模拟器按 `metrics.ts`
阈值计算目标值并做连续随机游走（异常恢复为指数回归正常带），越阈自动产生预警、恢复正常自动关闭预警。

---

## 降级机制（重要）

前端采用「fallback 优先」的数据钩子：首帧即渲染内置模拟数据，随后尝试请求 API，成功则切换为真实数据、失败则静默保持内置数据。
因此在以下任一情形下站点都**完整可用、无白屏、无未捕获异常**：

- GitHub Pages（HTTPS 页面无法访问本地 HTTP API，且默认纯静态部署）；
- 本地未启动后端；
- 离线 / `file://` 直接打开构建产物。

> GitHub Pages 部署仅发布 `dist`，默认「演示数据源」，无后端时自动降级到内置模拟数据，保证比赛 / 汇报 / 无设备环境下随时可展示。
> 部署工作流 `.github/workflows/deploy-pages.yml` 不执行任何后端命令、不安装 server 依赖。

---

## API 概览（统一前缀 `/api`，响应 `{ data, meta }`）

| 方法 & 路径 | 说明 |
|---|---|
| `GET /api/health` | 存活 / 数据源探测 |
| `GET /api/meta` | 指标阈值字典 + 当前数据源 / 场景 / 模拟间隔 |
| `GET /api/pools` · `GET /api/pools/:id` | 池列表（含未关闭预警数）/ 池详情（含最新 6 指标） |
| `GET /api/water-quality/latest?poolId=` | 某池最新 6 指标读数 |
| `GET /api/water-quality/history?poolId=&metricId=&range=&limit=&cursor=` | 历史曲线（时间分桶降采样 + keyset 分页，直供趋势图） |
| `GET /api/alerts?status=&poolId=&page=&pageSize=` · `PATCH /api/alerts/:id` | 预警查询 / 状态流转·备注 |
| `GET /api/dosing-records` · `POST /api/dosing-records` | 投放记录读 / 写（写时同建监测任务） |
| `GET /api/monitoring` · `POST /api/monitoring/:id/close` | 投放后监测读 / 收尾 |
| `GET /api/sensors?poolId=` | 传感器清单 + `last_seen` |
| `GET /api/summary` | 全局汇总（状态计数 / 未关闭预警数 / 更新时间），驱动导航角标与驾驶舱摘要 |
| `POST /api/sensor-data` | **传感器接入**：单条或批量样本 `{sensorId \| (poolId,metricId), value, unit?, recordedAt?}` |
| `POST /api/demo/scenario` | 切换模拟器场景 `{poolId?, scenario}`（演示模式） |

---

## 传感器接入

`POST /api/sensor-data` 是设备数据入口，支持单条或批量（数组，或 `{ samples: [...] }`）。样本可用 `sensorId`
（自动反查池 / 指标）或显式 `(poolId, metricId)` 定位；服务端统一「校验 → 落库 → 阈值判定（联动预警）→ 更新 `last_seen`」。
设置了 `SENSOR_TOKEN` 时需带 `Authorization: Bearer <token>`。

接入通道通过 `server/src/ingest/` 的 `IngestAdapter` 抽象解耦，全部汇入同一入库口径 `SensorDataService.ingest()`：

- `HttpAdapter` —— `POST /api/sensor-data`，**已实现并接线**；
- `MqttAdapter` / `TcpAdapter` —— **预留骨架 + TODO**（接线真实设备协议时实现 `start/stop` 与报文解析，复用同一入库/告警逻辑）。

本地无真实设备时，用 `npm run fake-sensor` 模拟上报验证全链路：

```bash
npm run server          # 终端 A：先起后端
npm run fake-sensor     # 终端 B：每 5s 上报一次；控制台打印 accepted / alertsCreated
```

运行后可观察到 `GET /api/sensors` 的 `last_seen` 持续递进、`GET /api/water-quality/latest` 数值变化、越阈样本产生新预警。

---

## 项目结构

```
水产网页/
├── src/                     # 前端（Vite 构建，GitHub Pages 只发 dist）
│   ├── app/
│   │   ├── data/            # 单一数据源（前端 fallback + 后端 seed 共用）
│   │   │   ├── metrics.ts   # 指标字典 / 阈值 / deriveStatus / 状态色
│   │   │   ├── pools.ts     # 池主数据 + 读数 + 场景解析(resolveReadings)
│   │   │   └── statusStyles.ts / alerts.ts / dosingRecords.ts / monitoringTasks.ts
│   │   ├── lib/apiClient.ts # fetch 封装 + 单飞去重 + TTL 缓存 + 超时 + 降级
│   │   ├── components/      # useApiData / DataContext / DataSourceToggle / SystemNavigation / TrendLineChart …
│   │   └── main/*           # 五大后台页面
│   └── main.tsx             # 入口（包 DataProvider）
├── server/                  # 后端子包（独立 package.json/tsconfig，不进入根构建）
│   ├── scripts/start.mjs    # 按 Node 版本注入 flag + .ts 解析钩子（--reset/--static/--selftest/--fake-sensor）
│   ├── scripts/fake-sensor.ts
│   └── src/
│       ├── index.ts / app.ts / config.ts
│       ├── db/              # driver(node:sqlite) / schema.sql / migrate / seed（复用前端 data）
│       ├── repositories/    # 每表一个纯 SQL 模块（唯一接触 DB 处）
│       ├── services/        # waterQuality / alert / dosing / summary / sensorData
│       ├── ingest/          # IngestAdapter 抽象 + Http/Mqtt/Tcp 适配器
│       ├── routes/          # 统一 /api 路由
│       └── simulator/       # scenario（阈值→目标值）+ engine（随机游走 + 事务批写）
└── README.md
```

---

## 说明

- 后端运行时直接执行 `.ts`（Node 原生 type-stripping），无构建产物；`server/data/*.db*` 已被 gitignore。
- 数据库为 6 表：`pools / sensors / water_quality_records / alerts / dosing_records / monitoring_records`。
- 时序数据采用复合索引 + keyset 分页 + 时间分桶降采样 + 保留期清理，避免无限增长。
- 前端 hash 路由（`/#/main`、`/#/main/alerts` 等），`base: "./"`，适配 GitHub Pages 子路径部署。


