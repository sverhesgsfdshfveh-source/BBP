# Browser-Bridge-Plus 实施拆解（6 PR 文件级改动清单）

日期：2026-02-20  
范围：仅 `browser-bridge-plus/`，不改 `../browser-bridge`

---

## 目录骨架（建议）

```txt
browser-bridge-plus/
  src/
    server/
      index.ts
      config.ts
      types.ts
      relay/
        connection-manager.ts
        client-registry.ts
        tab-registry.ts
        reconcile.ts
        lifecycle.ts
      transport/
        ws-server.ts
        ws-protocol.ts
      persistence/
        snapshot-store.ts
        snapshot-schema.ts
      metrics/
        counters.ts
        health.ts
      api/
        status-route.ts
        tabs-route.ts
        clients-route.ts
    extension/
      background/
        bootstrap.ts
        client-id.ts
        ws-client.ts
        tab-tracker.ts
        snapshot.ts
      shared/
        protocol.ts
    console/
      src/
        pages/
          RelayDashboard.tsx
        components/
          MetricsCards.tsx
          ClientGroupPanel.tsx
          TabList.tsx
        hooks/
          useRelayState.ts
        types.ts
  tests/
    unit/
    integration/
    e2e/
```

> 若你已有不同目录结构，按“模块职责+函数名”映射即可。

---

## PR-1：Server 核心状态机（Conn / Client / Tab + 90s grace）

### 目标
- 把“ws=身份”改为“clientId=身份”
- 实现 `offline_grace(90s)` 与超时迁移

### 文件级改动

1. `src/server/types.ts`
   - 新增类型：
     - `ClientStatus = 'online' | 'offline_grace' | 'offline_expired'`
     - `TabStatus = 'active' | 'stale' | 'closed' | 'stale_expired'`
     - `ConnectionState`, `ClientState`, `TabState`

2. `src/server/relay/connection-manager.ts`
   - 新增函数：
     - `registerConnection(connId, clientId, meta)`
     - `unregisterConnection(connId, reasonCode)`
     - `bindConnectionToClient(connId, clientId)`
   - 行为：连接断开只处理 connection，不直接删 client/tab

3. `src/server/relay/client-registry.ts`
   - 新增函数：
     - `upsertClient(clientId, patch)`
     - `markClientOfflineGrace(clientId, now, graceMs)`
     - `markClientOnline(clientId, connId, now)`
     - `expireClientIfDeadlinePassed(clientId, now)`
     - `gcExpiredClients(now)`

4. `src/server/relay/tab-registry.ts`
   - 新增函数：
     - `upsertTab(clientId, tabId, tabMeta)`
     - `markTabsStaleByClient(clientId, now)`
     - `removeActiveTabsByClient(clientId, now)`
     - `closeTab(clientId, tabId, now)`

5. `src/server/relay/lifecycle.ts`
   - 新增函数：
     - `handleWsClose(connId, code, now)`
     - `onGraceTimeoutTick(now)`
   - 逻辑：1001/其他 close 统一走 grace 流程

6. `src/server/config.ts`
   - 新增配置：
     - `relay.graceMs`（默认 90000）
     - `relay.expiredClientTtlMs`（默认 7d）
     - `relay.expiredTabTtlMs`（默认 24h）

7. `src/server/index.ts`
   - 注入 grace 定时器（例如每 1s 或 5s tick）

---

## PR-2：协议与重连对齐（clientId + tab_snapshot reconcile）

### 目标
- 强制握手带 `clientId`
- 重连后 snapshot 对齐 tab 集合

### 文件级改动

1. `src/extension/background/client-id.ts`
   - 新增函数：
     - `getOrCreateClientId()`（读写 `chrome.storage.local`）

2. `src/extension/shared/protocol.ts`
   - 定义消息：
     - `hello { clientId, version }`
     - `heartbeat { clientId, ts }`
     - `tab_open/tab_update/tab_close { clientId, tabId, ... }`
     - `tab_snapshot { clientId, tabs[], ts }`

3. `src/extension/background/ws-client.ts`
   - 新增函数：
     - `connectWithClientId(clientId)`
     - `sendHello()`
     - `sendHeartbeat()`
     - `onReconnectSuccess()`（触发 snapshot）

4. `src/extension/background/snapshot.ts`
   - 新增函数：
     - `collectActiveTabs()`
     - `sendTabSnapshot(ws, clientId)`

5. `src/server/transport/ws-protocol.ts`
   - 新增函数：
     - `validateHello(msg)`（缺 clientId 拒绝）
     - `parseRelayEvent(msg)`

6. `src/server/relay/reconcile.ts`
   - 新增函数：
     - `reconcileFromSnapshot(clientId, snapshotTabs, now)`
     - `applyTabEvent(clientId, event, now)`

7. `src/server/transport/ws-server.ts`
   - 在 `onMessage` 中路由：
     - hello -> client online/bind conn
     - snapshot -> reconcile
     - tab events -> applyTabEvent

---

## PR-3：控制台指标与分组视图

### 目标
- 指标口径拆分：clients_online / tabs_active(attach) / ws_connections
- 按 client 分组显示 tabs

### 文件级改动

1. `src/console/src/types.ts`
   - 新增：`RelayClientView`, `RelayTabView`, `RelayMetrics`

2. `src/server/api/status-route.ts`
   - 返回 `metrics`：
     - `clientsOnline`
     - `tabsActive`
     - `wsConnections`

3. `src/server/api/clients-route.ts`
   - 返回 client 列表及状态（online/grace/expired）

4. `src/server/api/tabs-route.ts`
   - 支持按 `clientId` 查询 tabs

5. `src/console/src/hooks/useRelayState.ts`
   - 拉取 metrics + clients + tabs
   - 组装 client->tabs 视图模型

6. `src/console/src/components/MetricsCards.tsx`
   - 展示三指标卡片

7. `src/console/src/components/ClientGroupPanel.tsx`
   - client 分组容器（可折叠）

8. `src/console/src/components/TabList.tsx`
   - 展示 active/stale/expired，附 `lastSeen`

9. `src/console/src/pages/RelayDashboard.tsx`
   - 替换旧 attach 单指标展示

---

## PR-4：持久化快照与恢复

### 目标
- 内存主表 + 轻量持久化
- 服务重启可恢复 client/tab 可观测状态

### 文件级改动

1. `src/server/persistence/snapshot-schema.ts`
   - 定义 JSON schema：
     - `version`
     - `clients[]`
     - `tabs[]`
     - `savedAt`

2. `src/server/persistence/snapshot-store.ts`
   - 新增函数：
     - `loadSnapshot()`
     - `saveSnapshot(state)`
     - `scheduleDebouncedSave()`

3. `src/server/relay/client-registry.ts`
   - 新增导出函数：`exportClientSnapshot()` / `importClientSnapshot()`

4. `src/server/relay/tab-registry.ts`
   - 新增导出函数：`exportTabSnapshot()` / `importTabSnapshot()`

5. `src/server/index.ts`
   - 启动时 `loadSnapshot` -> 注入 registries
   - 定期/事件触发 `saveSnapshot`

6. `src/server/config.ts`
   - 新增配置：
     - `relay.snapshotPath`
     - `relay.snapshotFlushMs`

---

## PR-5：可观测性、冲突保护与健康诊断

### 目标
- 快速定位“ID 冲突 vs 链路抖动”
- 给控制台和日志清晰诊断信号

### 文件级改动

1. `src/server/metrics/counters.ts`
   - 新增计数器：
     - `ws_close_total{code}`
     - `grace_reconnect_hit_total`
     - `grace_expire_total`
     - `client_id_conflict_total`

2. `src/server/relay/client-registry.ts`
   - 新增函数：
     - `detectClientIdConflict(clientId, connId)`
     - `resolveConflict(clientId, strategy='last-write-wins')`

3. `src/server/metrics/health.ts`
   - 新增函数：
     - `buildRelayHealthSummary()`

4. `src/server/api/status-route.ts`
   - 暴露诊断摘要（最近 N 分钟 close code 分布）

5. `src/server/transport/ws-server.ts`
   - close 事件打点与结构化日志

---

## PR-6：测试矩阵自动化（8 条）

### 目标
- 把验收矩阵固化为自动测试，防回归

### 文件级改动

1. `tests/unit/client-registry.spec.ts`
   - 覆盖：online->grace->expired 迁移

2. `tests/unit/tab-registry.spec.ts`
   - 覆盖：stale 标记、active 计数一致性

3. `tests/unit/reconcile.spec.ts`
   - 覆盖：snapshot upsert/cleanup 规则

4. `tests/integration/reconnect-1001.spec.ts`
   - 模拟 1001 + 90s 内重连

5. `tests/integration/multi-client-multi-tab.spec.ts`
   - A/B 客户端并发 + attach 计数

6. `tests/integration/client-id-conflict.spec.ts`
   - 冲突告警 + 冲突处理策略

7. `tests/integration/restart-recovery.spec.ts`
   - 快照恢复 + 重连再激活

8. `tests/e2e/dashboard-metrics.spec.ts`
   - 控制台指标口径校验

---

## 跨 PR 约束

- 仅在 `browser-bridge-plus/` 开发
- PR 合并顺序：`1 -> 2 -> 3 -> 4 -> 5 -> 6`
- 每个 PR 附最小可运行演示命令（README 更新）
- 所有新配置项提供默认值，避免破坏现有启动流程

---

## 建议的首批实现切片（今天可落地）

- Day 1：PR-1（基础状态机）+ PR-2（hello/clientId + snapshot）
- Day 2：PR-3（控制台指标）
- Day 3：PR-4（持久化）+ PR-5（诊断）
- Day 4：PR-6（补齐自动化回归）
