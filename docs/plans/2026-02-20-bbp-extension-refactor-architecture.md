# BBP Extension 重构架构（v0 / v1 / v2 三通道分层）

日期：2026-02-20  
状态：Approved Draft  
目标：按功能代际拆分目录，避免 v0 与 v1 逻辑混淆；保持 `service_worker.js` 作为外层入口。

---

## 1) 目标目录结构

```text
extension/
  service_worker.js            # 外层入口：协议接收、权限校验、路由分发、统一回包
  v0/
    read_executor.js           # v0 只读动作：extractText / extractLinks / querySelectorText
  v1/
    runjs_executor.js          # v1 runJs 动作
  v2/
    api_executor.js            # v2 API 动作执行器（open/click/type/screenshot...）
  utils/
    selector_utils.js          # 通用选择器工具、等待/重试、可交互性判断
```

---

## 2) 职责边界

### service_worker.js（外层）
- 解析 execute_in_tab 请求（兼容 executeInTab）
- 执行通用规则：
  - executionEnabled
  - allowlist（含 `*` / `all`）
  - protected page 拦截
  - capability 检查
- 按 `mode` 路由到 v0/v1 执行器
- 统一回包结构：`ok/data/error/meta`

### v0/read_executor.js
- 仅承载 v0 的只读动作：
  - `extractText`
  - `extractLinks`
  - `querySelectorText`
- 禁止承载 write/click/runJs 等非只读行为

### v1/runjs_executor.js
- 承载 `runJs` 执行与错误映射
- 输出可降级错误集合（供 auto 模式识别）

### v2/api_executor.js
- 承载扩展 API 动作（如 `openTab/focusTab/closeTab/clickSelector/typeSelector/screenshotTab/...`）
- `mode=api` 直接调用
- `mode=auto` 在 runJs 失败后调用（显式二次执行）

### utils/selector_utils.js
- 统一封装选择器定位、等待、可点击性、可输入性判断
- 避免 v0/v1 重复实现

---

## 3) 路由策略

- `mode=runJs`：直接走 `v1/runjs_executor`
- `mode=api`：直接走 `v2/api_executor`
- `mode=auto`：先 runJs，命中可降级错误后切换 `v2/api_executor`

---

## 4) 命名与演进原则

1. v0 / v1 目录只放本代逻辑，不跨代混放
2. 所有通用能力统一沉淀到 `utils/`
3. 新增动作优先落到对应代际 executor，不改动 service_worker 核心流程
4. 文档、错误码、回包格式必须保持一致性

---

## 5) 预期收益

- 代码可读性与维护性提升
- v0/v1 回归测试边界清晰
- 后续动作扩展（如 screenshotTab）不会污染主入口逻辑
