# BBP Extension 重构 TODO（按 v0/v1/v2 三通道分层）

日期：2026-02-20  
状态：Ready  
前置文档：`2026-02-20-bbp-extension-refactor-architecture.md`

---

## A. 文件与目录重排

- [ ] 创建目录：`extension/v0/`
- [ ] 创建目录：`extension/v1/`
- [x] 创建目录：`extension/v2/`
- [x] 创建目录：`extension/utils/`
- [x] 将 v0 只读动作从现有执行器迁移到：`extension/v0/read_executor.js`
- [x] 将 runJs 执行器迁移到：`extension/v1/runjs_executor.js`
- [x] 将 API 动作执行器迁移到：`extension/v2/api_executor.js`
- [x] 将 selector 工具迁移到：`extension/utils/selector_utils.js`

---

## B. service_worker.js 入口收敛

- [x] 保留 service_worker 作为唯一协议入口
- [ ] 仅保留：
  - 请求解析
  - 通用权限校验（executionEnabled / allowlist / protected）
  - capability 校验
  - 路由分发（mode=runJs|api|auto）
  - 统一回包
- [ ] 删除/迁移 service_worker 内的动作执行细节

---

## C. 路由与模式逻辑

- [x] `mode=runJs` -> `v1/runjs_executor`
- [x] `mode=api` -> `v2/api_executor`
- [x] `mode=auto`:
  - [x] 先 runJs
  - [x] 命中可降级错误（如 script_runtime_error）后切换 `v2/api_executor` 再执行一次
  - [x] 回包标记 `meta.fallbackUsed=true`

---

## D. 兼容与契约

- [x] 保持 `execute_in_tab` / `executeInTab` 双兼容
- [x] 保持 allowlist：`*` / `all` / `*.example.com`
- [x] 保持 protected page 拦截行为
- [ ] 保持错误码稳定（含 `super_mode_disabled`）
- [x] 保持统一回包结构不变

---

## E. 文档更新

- [x] 更新 `README.md`：目录结构与模式说明
- [x] 更新契约文档中的模块路径引用
- [x] 在 plans 目录记录重构后文件映射表（old -> new）

---

## F. 自检与联调

- [ ] `node --check extension/service_worker.js`
- [ ] `node --check extension/v0/read_executor.js`
- [ ] `node --check extension/v1/runjs_executor.js`
- [ ] `node --check extension/v2/api_executor.js`
- [ ] `node --check extension/utils/selector_utils.js`
- [ ] 两 client 联调：
  - [ ] 一个开 v1，一个不开 v1
  - [ ] 验证 mode=auto fallback 行为
  - [ ] 验证 v0 三动作回归

---

## G. 交付与提交

- [ ] 输出变更文件清单
- [ ] 输出联调结果摘要
- [ ] git commit（单一重构提交）
- [ ] 回传 commit hash
