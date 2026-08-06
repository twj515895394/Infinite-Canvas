# 04 - Canvas V2 增量持久化（Operation + Snapshot）

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 M4（Canvas 部分）

## 要构建什么

Canvas V2 后端：`GET/POST /api/v2/projects/{pid}/canvases`、`GET/PATCH /api/v2/canvases/{id}`、`POST /api/v2/canvases/{id}/operations`（增量 Operation：node.create/update/position.update/positions.update/delete、edge.create/update/delete、viewport.update、settings.update，单批 ≤200，`operation_id` 幂等去重，`base_revision` 冲突返回 409 `CANVAS_REVISION_CONFLICT`）、`PUT /api/v2/canvases/{id}/snapshot`（checkpoint/导入/压缩）。不做 CRDT。第一版支持从 Operation 序列重建画布状态（replay），revision 单调递增。

## 索引的设计文档

- `docs/studio-v2-api-v2-p0-contract-and-openapi-design.md`（Canvas Operation 类型表、revision/幂等、409 语义）
- `docs/studio-v2-backend-api-gap-and-v2-design.md`（Canvas V2 双轨：Operation + Snapshot，Phase B2）
- `docs/studio-v2-react-flow-node-model-and-registry-design.md`（Command→Operation 映射、增量持久化）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§7.1 画布保留矩阵：保存重开不丢数据）

## 验收标准

- [ ] 创建画布返回 Canvas DTO（含 revision、project_id、空状态）。
- [ ] 提交合法 Operation 批（≤200 条）：revision 递增、返回新 revision；按序重放可重建完整画布状态。
- [ ] 重复提交相同 `operation_id` 返回原结果（幂等），不重复应用。
- [ ] `base_revision` 过期返回 409 `CANVAS_REVISION_CONFLICT`，响应含当前 revision 供前端重新加载。
- [ ] 超过 200 条或非法 Operation 类型返回校验错误（400/422）。
- [ ] `PUT snapshot` 写入 checkpoint，之后可基于 snapshot 继续增量。
- [ ] `PATCH` 画布元数据（名称等）与操作分离，revision 语义一致。
- [ ] 不存在画布返回 404 `CANVAS_NOT_FOUND`；跨项目访问返回 404。
- [ ] 后端测试：replay 往返、幂等去重、revision 冲突、批次上限、404 各一条用例。

## 被阻塞于

- [01-b1-v2-backend-skeleton](./01-b1-v2-backend-skeleton.md)
