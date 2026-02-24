# BBP v1.1 计划：runJs 保留 + 扩展 API 备选执行器（TODO）

> ⚠️ 状态说明（2026-02-20 更新）：本文件为“第一版扁平结构 TODO（legacy）”。
> 当前以分层架构文档为准：
> - `2026-02-20-bbp-extension-refactor-architecture.md`
> - `2026-02-20-bbp-extension-refactor-todo.md`
> 为避免歧义，本文件不再作为实施主清单。

日期：2026-02-20  
状态：Planning  
目标：保留现有 `runJs`，新增“扩展 API 动作执行器”作为失败兜底通道，提升稳定性（尤其 CSP 场景）。

---

## 0. 范围与原则

- 保留：`action=runJs` 当前行为与协议
- 新增：`actionExecutor`（扩展 API 动作流）
- 策略：优先 runJs；当命中可预期失败（如 `script_runtime_error`）时可降级到 API 动作
- 代码组织：新增独立 JS 文件，避免继续膨胀 `service_worker.js`

---

## 1. 文件结构调整（TODO）

- [ ] 新增 `extension/action_executor.js`
  - 封装 API 动作：`openTab/focusTab/closeTab/extractText/click/type`
- [ ] 新增 `extension/runjs_executor.js`
  - 承接现有 runJs 逻辑（从 `service_worker.js` 拆出）
- [ ] （可选）新增 `extension/selector_utils.js`
  - 元素定位、重试、错误归一化
- [ ] `extension/service_worker.js` 改为：
  - 协议入口 + 权限裁决 + 分发 + 回包

---

## 2. 协议与动作（TODO）

### 2.1 现有动作保留
- [ ] `runJs`
- [ ] `extractText` / `extractLinks` / `querySelectorText`

### 2.2 新增动作（API 执行器）
- [ ] `openTab`（`url`）
- [ ] `focusTab`（`tabId`）
- [ ] `closeTab`（`tabId`）
- [ ] `click`（`selector|text`）
- [ ] `type`（`selector`, `text`）
- [ ] `extractText`（可复用现有）

### 2.3 统一返回结构
- [ ] 所有动作统一 `ok/data/error/meta`
- [ ] `meta` 至少包含：`action/tabId/durationMs`

---

## 3. 执行策略（TODO）

- [ ] 增加模式字段（兼容默认值）
  - `mode: "runJs" | "api" | "auto"`
- [ ] `auto` 策略：
  - 先尝试 runJs
  - 若失败码在可降级集合（如 `script_runtime_error`）→ 自动改走 API 动作
- [ ] 降级链路可观测（返回 `meta.fallbackUsed=true`）

---

## 4. 权限与兼容（TODO）

- [ ] 保持现有 allowlist 逻辑（含 `*` / `all`）
- [ ] 保持 protected page 拦截
- [ ] 保持 v0/v1 capability 两复选框模型（read/runJs）
- [ ] API 动作默认映射到 `read`（后续可再扩）

---

## 5. 测试计划（TODO）

- [ ] 用例 A：runJs 成功，不触发 fallback
- [ ] 用例 B：runJs 因 CSP 失败，auto 成功走 API 动作
- [ ] 用例 C：未开启 runJs 时，api 动作仍可执行（若策略允许）
- [ ] 用例 D：protected page 一律拦截
- [ ] 用例 E：v0 三动作回归通过

---

## 6. 交付物（TODO）

- [ ] 代码变更（extension 源码，不触碰 dist/extension-dist）
- [ ] README 更新（动作与模式说明）
- [ ] 契约文档增补（fallback 策略与错误码）
- [ ] 一次端到端联调记录（两 client：一个开 v1，一个未开）

---

## 7. 里程碑（建议）

- M1（半天）：拆文件 + 保持现有功能不回归
- M2（半天）：新增 API 动作 + `mode=api`
- M3（半天）：`mode=auto` 降级链路 + 回归测试
- M4（半天）：文档与联调收尾

---

## 8. 完成判定

- [ ] runJs 保留可用
- [ ] CSP 场景下 auto 能完成同等目标（至少 open/focus/extract）
- [ ] service_worker 复杂度下降（核心逻辑已分层）
- [ ] 两客户端混合场景可稳定运行
