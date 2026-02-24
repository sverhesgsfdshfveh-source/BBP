# Browser Relay 多 Client / 多 Tab 架构设计（方案二）

日期：2026-02-20  
状态：已评审通过（刘亮确认）

## 1. 背景与问题

当前控制台出现以下问题：

- 实际有多个扩展 client 在线，但控制台仅显示一个 attach 或 0 tabs
- 日志出现 `ws_health: ws-close code=1001 ×N` 后，状态易抖动/丢失
- 连接（ws）与身份（client）耦合，导致断线即“身份丢失”

目标是将系统改造成：

- 一个 client 代表一个扩展实体（持久身份）
- 一个 client 下维护多个 tabs 的状态
- ws 仅是瞬时连接，不再承载身份语义
- 支持既定重连策略（grace 90s）

---

## 2. 设计结论（已定）

- 采用 **方案二（推荐方案）**
- 状态策略采用 **C（混合）**：内存实时 + 轻量持久化快照
- `clientId` 来源采用 **A**：扩展首次安装生成 UUID，存 `chrome.storage.local`
- grace period：**90 秒**

---

## 3. 核心模型

采用三层解耦：

1. **Connection（瞬时层）**
   - 表示一次 ws 会话
   - 字段示例：`connId`, `clientId`, `connectedAt`
   - 断线即销毁

2. **Client（身份层）**
   - 表示扩展实体
   - 主键：`clientId`
   - 字段示例：`status`, `lastSeen`, `graceDeadline`, `meta`

3. **Tab（资源层）**
   - 表示 client 下可控制页面
   - 主键：`(clientId, tabId)`
   - 字段示例：`status`, `url`, `title`, `lastSeen`

---

## 4. 指标定义（修正后）

- **Client 数** = 在线扩展实体数（按 `clientId` 去重）
- **Attach 数** = 当前 active tab 总数（可控制页面数）
- **WS 数** = 当前连接会话数（诊断指标）

> 说明：Attach 数不是 client 数，也不是 ws 数。

---

## 5. 生命周期与状态机

### 5.1 断线（典型：`code=1001`）

- Connection：立即销毁
- Client：进入 `offline_grace`，启动 90 秒计时
- Tabs：标记为 `stale`（保留显示但不可操作/灰态）

### 5.2 grace 内重连成功（同 `clientId`）

- Client：恢复 `online`
- 新 conn 绑定到现有 client
- Tabs：通过 snapshot reconcile，`stale -> active`
- 不新建“身份级 attach”，而是恢复 tab 级 active 集合

### 5.3 grace 超时仍未重连

- Tabs：从 active 视图移除（可转 archived/offline）
- Client：转 `offline_expired`（保留用于排障）
- 后续由 GC 清理最终过期数据

建议 GC：

- expired tabs：24h 清理
- expired clients：7d 清理

---

## 6. 协议设计

### 6.1 扩展 -> 服务端最小字段

每条事件/心跳包含：

- `clientId`
- `tabId`
- `windowId`（可选）
- `url`, `title`
- `eventType`：`tab_open | tab_update | tab_close | heartbeat`
- `ts`

### 6.2 重连后的快照对齐（关键）

扩展在重连成功后立即发送 `tab_snapshot`（当前全部 active tabs）。

服务端 reconcile 规则：

- snapshot 中存在：upsert active
- 服务端存在但 snapshot 缺失：标记 closed/stale_expired
- 最终保证 attach 数与 snapshot 一致

---

## 7. 持久化策略（混合 C）

持久化：

- `ClientState` 轻量字段
- `TabState` 轻量字段

不持久化：

- `ConnState`（瞬时）

重启恢复：

- 读取 client/tab 快照，初始化为 `offline_expired` 或 `stale`
- 等待扩展重连并通过 snapshot 激活

---

## 8. 控制台/UI 约束

- 顶部指标分离显示：`clients_online / tabs_active / ws_connections`
- 以 client 分组展示 tabs（支持展开）
- stale/offline_expired 显示灰态和 `lastSeen`
- 避免单一“attach”数字混淆多层语义

---

## 9. 分阶段实施计划

### Phase 1：数据模型改造

- 引入 Client/Tab/Conn 三层结构
- 代码中去除“ws=身份”假设
- 接入 90s grace 计时

### Phase 2：协议与重连

- 扩展握手强制 `clientId`
- 重连后发送 `tab_snapshot`
- 服务端实现 snapshot reconcile

### Phase 3：控制台改造

- 新指标与分组视图
- stale/expired 状态可视化

### Phase 4：持久化与 GC

- client/tab 轻量快照落盘
- 恢复逻辑 + 定期 GC

---

## 10. 测试矩阵（验收）

1. 单 client 多 tab（attach=tab active 数）
2. 双 client 并发（总 attach 可累加）
3. 1001 抖动下 30s 内重连恢复
4. 超过 90s 未重连后状态清退
5. clientId 冲突检测与告警
6. snapshot reconcile 清理幽灵 tab
7. server 重启后状态恢复与再激活
8. 高频 tab 变更下无重复/负数/错计

---

## 11. 风险与缓解

风险：

- clientId 冲突导致互相覆盖
- 扩展未按时发送 snapshot 导致短暂错计
- UI 旧语义与新指标混用

缓解：

- 冲突时记录告警并以最新连接为准（可加“踢旧连”策略）
- 对 snapshot 增加超时重试/回退逻辑
- 指标命名和文案统一，避免“attach”概念歧义

---

## 12. 结论

该设计将“连接瞬时性”与“client持久身份”彻底解耦，能够支撑：

- 多 client 并发稳定注册
- 单 client 多 tabs 正确计数
- `ws-close 1001` 场景下的无缝恢复
- 服务重启后的可观测与可恢复能力

已与需求方确认：**方案二 + 90 秒 grace + attach=active tabs**。
