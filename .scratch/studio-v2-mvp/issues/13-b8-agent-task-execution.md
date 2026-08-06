# 13 - Agent Task 执行闭环后端

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 M3（执行闭环部分）、用户故事 40-47

## 要构建什么

Agent Task 执行闭环后端：Task 创建（`POST /api/v2/agent-tasks`，幂等 Namespace + Idempotency-Key，入参含 agent_id/skill_id/输入消息/Context 引用）、列表/详情（`GET`、`GET /{task_id}`）、取消（`POST /{task_id}/cancel`）、事件流（`GET /{task_id}/events`，SSE/轮询）；状态机 queued→running→waiting_input→succeeded/failed/cancel_requested→cancelled；Dispatcher 后台组件从 SQLite Claim queued Run → 建 Context Snapshot（执行前把 AssetVersion 解析为 Pinned Version 固定）→ 调 Runtime Adapter（Codex CLI 优先）→ 消费归一化事件；Adapters 输出归一化为统一事件，Service 不解析 stdout 文本；Tool Gateway 为唯一稳定入口，有副作用 Tool 带 Idempotency Key，Permission 一次性决策（原子条件更新防双点）；Retry 复用原 Task 建新 Run 不覆盖历史；服务重启后历史保留，无法恢复的 Run 标 interrupted。数据表：agent_sessions、agent_tasks、agent_runs、agent_steps、agent_messages、context_snapshots、context_references、tool_calls、permission_requests、permission_grants、idempotency_records 等。

## 索引的设计文档

- `docs/studio-v2-agent-skill-runtime-and-management-design.md`（Session/Task/Run 模型、Tool/Permission、Artifact 输出）
- `docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md`（表结构、Dispatcher、幂等、P0 验收 15 条）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§9.5 Task 状态、§9.6 Context、§9.7 权限简化）

## 验收标准

- [ ] 创建 Task 立即返回（不阻塞执行）；事件流可观察到状态迁移与消息（流式/轮询）。
- [ ] 状态机全迁移正确：queued→running→succeeded/failed；取消走 cancel_requested→cancelled。
- [ ] Retry 复用原 Task 建新 Run，历史 Run 保留不覆盖。
- [ ] 相同 Idempotency-Key 重复创建返回同一 Task。
- [ ] Context Snapshot 在 Run 启动时固定 Pinned Version；执行期间资产版本变化不影响本次 Run。
- [ ] 同一副作用 Tool Call 重放不重复执行（Idempotency 生效）。
- [ ] 服务重启后历史 Task/Run 仍在；无法恢复的 Run 标 interrupted 而非静默消失。
- [ ] 失败 Task 返回可理解错误信息（含 error 字段）。
- [ ] 后端测试：状态机全路径、取消、Retry、幂等、Snapshot 固定、重启恢复各一条用例。

## 被阻塞于

- [06-b6-agent-runtime-probe](./06-b6-agent-runtime-probe.md)
- [07-b7-agent-profile-skill](./07-b7-agent-profile-skill.md)
