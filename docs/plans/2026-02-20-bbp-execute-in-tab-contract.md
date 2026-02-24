# Browser Bridge Plus 接口契约文档（Draft v0.1）

日期：2026-02-20  
状态：Draft（待评审）  
范围：`executeInTab` 单接口 + 扩展侧权限裁决

---

## 1. 目标

通过一个统一接口 `executeInTab`，在指定浏览器 tab 中执行“受控动作”，优先满足内容读取能力；并通过扩展 Options 中的白名单与能力开关做最终权限裁决。

---

## 2. 设计原则

1. **默认最小权限**：仅 `read` 能力默认开启。
2. **客户端最终裁决**：即使服务端请求合法，扩展端也必须二次校验并可拒绝。
3. **先安全后能力**：v0 仅支持受控只读动作；高风险能力需显式勾选。
4. **轻量化优先**：v0 不做审计日志落盘，先保证功能闭环与安全边界。

---

## 3. 权限模型（Options 配置）

扩展 `options.html` 提供以下配置：

### 3.1 域名白名单（Allowlist）
- 支持精确域名与子域匹配（例如：`linux.do`、`*.linux.do`）
- 不在白名单内：直接拒绝执行

### 3.2 能力开关（Capabilities）
- `read`（默认 ON）
- `runJs`（默认 OFF，v1 super mode）

> v0 实际仅启用 `read` 相关动作；其余能力先保留配置位，为 v1 预留。

### 3.3 全局执行开关
- `executionEnabled`（默认 ON）
- OFF 时拒绝所有执行请求

---

## 4. 接口定义：executeInTab

## 4.1 HTTP API

`POST /api/execute-in-tab`

### Request
```json
{
  "clientId": "0723533c-fd19-40d0-b060-07c2f4e6723e",
  "tabId": "555882437",
  "action": "extractText",
  "params": {
    "includeLinks": false
  },
  "timeoutMs": 8000,
  "requestId": "req_20260220_xxx"
}
```

字段说明：
- `clientId`：目标客户端（必填）
- `tabId`：目标标签页（必填；v0 不支持“自动选 active”）
- `action`：执行动作（见 4.2）
- `params`：动作参数
- `timeoutMs`：超时（默认 8000，范围 1000~15000）
- v0 不设置 `maxChars`/`maxBytes` 的固定上限（按页面实际返回）
- `requestId`：可选，调用方幂等/追踪

### Response（成功）
```json
{
  "ok": true,
  "requestId": "req_20260220_xxx",
  "data": {
    "url": "https://linux.do/c/welfare/36",
    "title": "最新福利羊毛话题 - LINUX DO",
    "text": "...",
    "links": [],
    "capturedAt": 1771585500000
  },
  "meta": {
    "clientId": "0723...",
    "tabId": "555882437",
    "action": "extractText",
    "durationMs": 214,
    "resultBytes": 18342
  }
}
```

### Response（失败）
```json
{
  "ok": false,
  "requestId": "req_20260220_xxx",
  "error": {
    "code": "capability_denied",
    "message": "Capability write is disabled by client options",
    "reason": "capability_off"
  },
  "meta": {
    "clientId": "0723...",
    "tabId": "555882437",
    "action": "extractText",
    "durationMs": 7
  }
}
```

---

## 4.2 v0 动作集合（只读）

### A) `extractText`
提取页面可见文本。

参数：
- `maxChars?: number`（可选；调用方可传，v0 不设默认与上限）
- `selector?: string`（可选，限定区域）
- `includeLinks?: boolean`（默认 false）

返回：
- `url`, `title`, `text`, `links?`, `capturedAt`

### B) `extractLinks`
提取页面链接列表。

参数：
- `maxLinks?: number`（可选；调用方可传，v0 不设默认与上限）
- `sameHostOnly?: boolean`（默认 false）

返回：
- `url`, `title`, `links[]`, `capturedAt`

### C) `querySelectorText`
提取特定 CSS 选择器的文本。

参数：
- `selector: string`（必填）
- `all?: boolean`（默认 false）
- `maxChars?: number`（可选；调用方可传，v0 不设默认与上限）

返回：
- `url`, `title`, `value|string[]`, `capturedAt`

---

## 5. 扩展端裁决流程（强制）

收到执行请求后，扩展端按顺序校验：

1. `executionEnabled` 是否开启
2. `clientId/tabId` 是否匹配当前可控上下文
3. 目标 `url` 域名是否命中白名单
4. `action` 映射能力是否已放行（v0 仅 read）
5. 参数是否合法（长度、数量、超时）

任一步失败：
- 立即返回拒绝，不执行注入
- 返回结构化错误（v0 不做审计日志落盘）

---

## 6. 错误码契约

- `execution_disabled`
- `client_not_found`
- `tab_not_found`
- `domain_not_allowed`
- `capability_denied`
- `invalid_params`
- `timeout`
- `protected_page`
- `script_runtime_error`
- `internal_error`

说明：
- `protected_page` 用于 Cloudflare challenge / 浏览器安全页等不可读场景
- `script_runtime_error` 用于 DOM 读取执行期异常

---

## 7. 可观测（v0 轻量）

v0 不做审计日志落盘，仅保留运行时可观测指标：
- `content_exec_total`
- `content_exec_success_total`
- `content_exec_fail_total{reason}`
- `content_exec_latency_ms`

说明：
- 失败原因通过接口返回结构化错误码；
- 审计落盘在 v1（引入 write/click/fetch 时）再启用。

---

## 8. 安全约束（v0）

- 不支持任意 JS 文本执行
- 禁止 `fetch/XHR/WebSocket` 主动联网
- 禁止点击、输入、提交、导航
- 禁止访问 cookies/storage/密码字段
- v0 不设置固定 `maxBytes` 上限（由调用方与运行时超时共同约束）

---

## 9. v1 扩展方向（非本次实现）

在 v0 稳定后可考虑：
- `customScript`（受控）
- 新能力映射：`runJs`
- 管理员开关 + 脚本 hash 审计 + 域名范围绑定

---

## 10. 最小验收标准（契约级）

1. 未命中白名单请求必拒绝，错误码稳定
2. 关闭 `read` 后，所有 v0 动作必拒绝
3. 普通公开页 `extractText` 可返回结构化结果
4. 受保护页返回 `protected_page`，不崩溃
5. 并发两个 client 时不串 tab 结果

---

## 11. 待你确认的点

1. v0 是否强制 `tabId` 必填（当前建议：必填，避免误读）
2. `maxChars`/`maxBytes`：按你的要求，v0 不设固定默认大小限制
3. 域名规则是否支持通配符仅 `*.` 前缀（当前建议：先只支持这一种）
4. 审计日志策略：按你的要求，v0 不落盘
