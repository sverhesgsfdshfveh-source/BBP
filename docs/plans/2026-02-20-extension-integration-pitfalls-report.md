# Browser-Bridge-Plus 扩展联调踩坑复盘（2026-02-20）

## 背景
在将 browser-bridge-plus 的新 server 与扩展对齐过程中，出现了多次“看似连接失败、实则多因素叠加”的问题。本文记录已踩坑与修复策略，避免重复犯错。

## 已踩坑清单

### 1) 交付了 placeholder 扩展（仅 manifest + background）
- **现象**：扩展几乎不可测，无法稳定配置与联调。
- **根因**：把“骨架产物”误当“可交付产物”。
- **修复**：改为基于完整 extension 目录开发，包含 options/popup/service worker 全链路。
- **预防**：打包前做最小验收清单（见文末）。

### 2) 默认 endpoint 指向 localhost，导致 reload 即报错
- **现象**：扩展重载后立刻 `ERR_CONNECTION_REFUSED ws://localhost:8787`。
- **根因**：默认配置对远程环境（Codespaces）不成立。
- **修复**：默认 `endpoint=''`、`enabled=false`，必须手动配置后启用。
- **预防**：远程部署场景禁止 hardcode localhost。

### 3) 用旧扩展测新协议，导致 1008
- **现象**：服务端 `wsCloseByCode.1008` 持续增长。
- **根因**：新 server 要求首包 `hello+clientId`，旧扩展首包不匹配。
- **修复**：明确“以新扩展测新协议”，不做隐式混测。
- **预防**：联调前先写协议兼容矩阵。

### 4) app.github.dev 场景下使用 ws/http 导致 302/401/CORS
- **现象**：`Unexpected response code: 302`、`www-authenticate: tunnel`、preflight 被拦截。
- **根因**：公开转发端口必须走 HTTPS/WSS，且端口可见性需 Public。
- **修复**：统一使用 `wss://<host>/ws` 或 `wss://<host>/?type=browser`。
- **预防**：文档与默认提示中明确“远程必须 wss”。

### 5) 误把产物目录当开发目录
- **现象**：`extension-dist` 与 `extension` 内容不一致，排障混乱。
- **根因**：开发流与发布流边界不清。
- **修复**：只在 `extension/` 开发，`extension-dist/` 仅由构建脚本产出。
- **预防**：README 标明目录职责。

## 这次采用的修正策略
1. 基于 `browser-bridge-plus/extension` 二次开发（UI/配置页可用）
2. 协议对齐 server：`hello/clientId` 首包 + snapshot/tab 事件/heartbeat
3. 默认安全：不自动连接、先配置 endpoint 再启用
4. 保留 server 对 `/ws` 与 `/?type=browser` 的接入兼容
5. 恢复打包流程：`extension -> extension-dist -> zip`

## 最小验收清单（以后每次发包前必须过）
- [ ] 扩展图标可点，Options 可打开
- [ ] 可保存 endpoint 与 enabled
- [ ] reload 后不出现 localhost 自动连接错误
- [ ] 连接后 `/api/status` 至少出现 `clientsOnline>=1 && wsConnections>=1`
- [ ] tab 打开/切换/关闭后 `tabsActive` 有变化
- [ ] zip 中包含 `manifest + service_worker + options + popup`（若有）

## 结论
本次问题本质不是单点 bug，而是“开发目录、交付物、环境假设、协议版本”四类边界混淆。后续按上述清单执行，可显著降低重复踩坑概率。
