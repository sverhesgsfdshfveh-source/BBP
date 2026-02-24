# BBP v2 三通道方案（v0 安全 / v1 runJs / v2 API）

日期：2026-02-20  
状态：Approved (by user)

## 目标
将执行链路明确分为三条独立通道，消除“API 动作挂在 runJs 兜底通道”导致的权限混淆。

## 三通道定义

1. **v0 安全通道**
   - 只读动作：`extractText` / `extractLinks` / `querySelectorText`
   - 权限：`v0(read)`

2. **v1 runJs 通道**
   - 动作：`runJs`
   - 权限：`v1(runJs)`
   - 可能受 CSP 影响

3. **v2 API 动作通道**
   - 动作：`openTab` / `focusTab` / `closeTab` / `clickSelector` / `typeSelector` / `waitForSelector` / `waitForText` / `querySelectorAttr` / `screenshotTab`
   - 权限：建议从 runJs 解耦（可与 v0(read) 共享或独立 v2 开关，后续定）

## mode 行为

- `mode=runJs`：仅走 v1
- `mode=api`：仅走 v2
- `mode=auto`：先走 v1；若失败命中可降级错误（如 CSP）再切到 v2 执行一次

## 关键原则

- API 动作不再定义为“fallback 专属”，它是独立主通道
- screenshotTab 不应依赖 v1(runJs) 开关
- 回包统一，但 meta 需要标明 `modeUsed` / `fallbackUsed`

## 重构后文件映射（old -> new）

- `extension/v1/api_fallback_executor.js` -> `extension/v2/api_executor.js`
- `extension/v1/runjs_executor.js` -> `extension/v1/runjs_executor.js`（保留，仅 v1 runJs）
- `extension/v0/read_executor.js` -> `extension/v0/read_executor.js`（保留，仅 v0 只读）
- `extension/service_worker.js` -> `extension/service_worker.js`（保留外层入口，收敛路由与校验）

## 待定项

- v2 API 通道能力开关的最终策略：
  - 方案A：归到 `v0(read)`（当前实现，最小改动且已与 runJs 解耦）
  - 方案B：新增 `v2(api)` 开关（更清晰）
