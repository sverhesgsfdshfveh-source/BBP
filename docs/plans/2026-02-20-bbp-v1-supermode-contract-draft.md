# Browser Bridge Plus v1 契约草案（Super Mode）

日期：2026-02-20  
状态：Draft v0.1  
范围：在 v0 基础上引入 v1「超级权限」——允许执行任意 JS

---

## 1. 目标

在保留 v0（安全只读）能力的同时，新增 v1 超级权限模式：
- v1 开启后，允许在指定 tab 执行任意 JavaScript 代码
- 停用方式：关闭扩展或关闭浏览器

---

## 2. 范围定义

### v0（现状）
- 只读动作：`extractText` / `extractLinks` / `querySelectorText`
- 扩展端权限裁决：`executionEnabled` + `allowlist` + `read capability`

### v1（新增）
- 新动作：`runJs`
- 入参携带任意 JS 代码字符串
- 在目标 tab 注入并执行，返回执行结果或错误

---

## 3. v1 最小安全约束（按当前确认）

1. **默认关闭**：`superModeEnabled = false`
2. **域名白名单继续生效**：未命中 allowlist 仍返回 `domain_not_allowed`
3. **保护页禁止执行**：`chrome://`、`chrome-extension://`、`about:` 等继续拦截为 `protected_page`

> 注：不增加“一键紧急关闭”专用按钮。停用依赖关闭扩展或关闭浏览器。

---

## 4. Options 配置项（扩展端）

在现有 options 增加：

- `superModeEnabled: boolean`（默认 false）
  - 开启后允许 `action=runJs`
- `executionAllowlist: string[]`（沿用 v0）
  - 支持：`example.com`、`*.example.com`、`*`、`all`

其余 v0 配置保持不变。

---

## 5. API 契约扩展（execute-in-tab）

接口沿用：`POST /api/execute-in-tab`

### Request（v1）
```json
{
  "clientId": "<client-id>",
  "tabId": "<tab-id>",
  "action": "runJs",
  "params": {
    "code": "return document.title;"
  },
  "timeoutMs": 8000,
  "requestId": "req_xxx"
}
```

### 字段说明
- `action=runJs`：进入 v1 超级权限执行路径
- `params.code`：任意 JS 字符串（必填）
- `timeoutMs`：可选，默认 8000

### Response（成功）
```json
{
  "ok": true,
  "requestId": "req_xxx",
  "result": {
    "type": "execute_in_tab_result",
    "requestId": "req_xxx",
    "ok": true,
    "action": "runJs",
    "tabId": "<tab-id>",
    "data": {
      "value": "最新福利羊毛话题 - LINUX DO",
      "capturedAt": 1771590000000
    },
    "meta": {
      "action": "runJs",
      "tabId": "<tab-id>",
      "durationMs": 12
    }
  }
}
```

### Response（失败）
```json
{
  "ok": false,
  "requestId": "req_xxx",
  "result": {
    "type": "execute_in_tab_result",
    "requestId": "req_xxx",
    "ok": false,
    "action": "runJs",
    "tabId": "<tab-id>",
    "error": {
      "code": "super_mode_disabled",
      "message": "Super mode is disabled",
      "reason": "super_off"
    },
    "meta": {
      "action": "runJs",
      "tabId": "<tab-id>",
      "durationMs": 1
    }
  }
}
```

---

## 6. 扩展端裁决顺序（v1）

收到请求后按顺序处理：

1. `executionEnabled` 检查
2. `tabId` 存在性检查
3. 保护页检查（protected）
4. 域名 allowlist 检查
5. 若 `action=runJs`：检查 `superModeEnabled`
6. 校验 `params.code` 为非空字符串
7. 执行并回传结果

---

## 7. 错误码（新增/沿用）

沿用 v0：
- `execution_disabled`
- `tab_not_found`
- `domain_not_allowed`
- `protected_page`
- `invalid_params`
- `timeout`
- `script_runtime_error`
- `internal_error`

v1 新增：
- `super_mode_disabled`

---

## 8. 执行结果约定

`runJs` 的 `data.value` 约定：
- 可为任意可序列化 JSON 值（string/number/bool/object/array/null）
- 若返回值不可序列化，扩展端应转为可读字符串或返回 `script_runtime_error`

---

## 9. 最小验收用例（v1）

1. `superModeEnabled=false` 时调用 `runJs` 返回 `super_mode_disabled`
2. `superModeEnabled=true` 且 allowlist 命中时可执行 `return document.title`
3. allowlist 不命中时返回 `domain_not_allowed`
4. `chrome://extensions` 等保护页返回 `protected_page`
5. `params.code` 缺失或空字符串返回 `invalid_params`

---

## 10. 非目标（本草案不做）

- 不拆分更多权限层级（保持 v0 + v1 两级）
- 不新增审计落盘能力
- 不新增紧急开关按钮

---

## 11. 待确认

1. `runJs` 返回值是否需要统一包装为 `{ value, type }`（当前草案仅 `value`）
2. `timeoutMs` 上限是否保持与 v0 一致（建议先一致）
