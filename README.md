# browser-bridge-plus

独立实现：多 client / 多 tab relay 架构（不修改 `../browser-bridge`）。

## 功能覆盖（对应 PR-1 ~ PR-6）

- 三层状态机：`Connection` / `Client` / `Tab`
- `grace=90s`：断线进入 `offline_grace`，超时转 `offline_expired`
- `clientId` 持久化（扩展侧首次生成并复用）
- `tab_snapshot` reconcile（重连后全量对齐）
- 控制台三指标：`clients_online` / `tabs_active` / `ws_connections`
- client 分组 tab 视图（active/stale/expired）
- 轻量快照持久化与重启恢复
- 诊断计数器与冲突告警（`client_id_conflict_total` 等）
- 自动化测试矩阵（unit/integration/e2e）

## 目录结构

- `src/server`: relay server + ws + api + persistence + metrics
- `src/extension`: 早期扩展协议与类型（历史目录，保留兼容）
- `extension`: 当前扩展主源码目录（active）
- `src/console`: 控制台数据模型与渲染逻辑
- `tests`: unit/integration/e2e
- `scripts`: 构建扩展/控制台脚本

### Extension 当前架构（active）

- `extension/service_worker.js`：协议入口、权限校验、路由分发、统一回包
- `extension/v0/`：v0 只读动作执行器
- `extension/v1/`：v1 执行器（runJs）
- `extension/v2/`：v2 API 动作执行器（open/click/type/screenshot 等）
- `extension/utils/`：通用工具（selector/等待/重试）

> 说明：请以 `extension/` 为唯一开发入口，不要在 `extension-dist/` 直接开发。

## 本地开发

```bash
npm install
npm run dev:server
```

默认端口 `8787`，可通过 `PORT=8788` 覆盖。

## 运行 Server

```bash
npm run start:server
# or
PORT=8788 npm run start:server
```

API:

- `GET /api/healthz`
- `GET /api/status`
- `GET /api/clients`
- `GET /api/tabs?clientId=...`

WS:

- `ws://localhost:<port>/ws`

## 加载扩展

1. 构建扩展产物：

```bash
npm run build:extension
```

2. 打开 Chrome -> 扩展程序 -> 开启开发者模式 -> 加载已解压扩展
3. 选择目录：`extension-dist/`
4. 在扩展详情 -> 选项页，配置 `Relay WebSocket Endpoint`

默认 endpoint：`ws://localhost:8787/?type=browser`

生产模板：`wss://<your-host>/?type=browser`

当前 MV3 扩展已包含：
- `service_worker.js`：WebSocket 连接、hello、heartbeat、tab_open/tab_update/tab_close/tab_snapshot 上报
- `chrome.storage.local` 持久化 `clientId`、`endpoint`、`enabled`
- 自动重连（指数退避）与 ON/OFF 开关
- `options.html/options.js` 配置页
- `execute-in-tab` 配置：`executionEnabled`、`executionAllowlist`、`executionCapabilities`（当前仅 `v0(read)` 与 `v1(runJs)`；v2 API 动作按最小改动临时映射到 `read`，已与 runJs 解耦）
- `execute-in-tab` 请求可选 `mode`：`runJs | api | auto`
  - `runJs`：仅执行 v1 `runJs` 通道
  - `api`：直接走 v2 API 动作通道（不依赖 runJs fallback）
  - `auto`：先 runJs，命中可降级错误（如 `script_runtime_error`/`timeout`/`protected_page`）再切换 v2 API 通道重试，并在 `result.meta.fallbackUsed=true`

### v0.5 P0 已落地动作（extension/）

- Tab：`openTab`、`focusTab`、`closeTab`
- DOM：`clickSelector`（兼容别名 `click`）、`typeSelector`（兼容别名 `type`）
- Wait：`waitForSelector`、`waitForText`
- Query：`querySelectorAttr`
- Capture：`screenshotTab`（`chrome.tabs.captureVisibleTab`）

`screenshotTab` 返回 `data.imageBase64`（无 maxBytes 限制），并附带 `url` / `title` / `capturedAt` 元信息。

## 控制台查看

当前实现为 API 驱动的 dashboard 渲染模块：

- `src/console/src/pages/RelayDashboard.tsx`
- 指标卡：`MetricsCards.tsx`
- 分组与 tab 列表：`ClientGroupPanel.tsx`, `TabList.tsx`

构建占位输出：

```bash
npm run build:console
```

## 持久化快照

- 默认路径：`dist/relay-snapshot.json`
- 刷盘间隔：`RELAY_SNAPSHOT_FLUSH_MS`（默认 2000ms）

可配置项（环境变量）：

- `RELAY_GRACE_MS`（默认 90000）
- `RELAY_EXPIRED_CLIENT_TTL_MS`（默认 7d）
- `RELAY_EXPIRED_TAB_TTL_MS`（默认 24h）
- `RELAY_SNAPSHOT_PATH`
- `RELAY_SNAPSHOT_FLUSH_MS`

## 测试

```bash
npm test
```

覆盖：

- unit: client/tab registry + reconcile
- integration: 1001 重连、多 client 多 tab、clientId 冲突、重启恢复
- e2e: dashboard 三指标口径

## 打包扩展

```bash
npm run build
npm run pack:extension
```

产物：

- `extension-dist/`（可加载目录）
- `dist/browser-bridge-plus-extension.zip`
