# 03 - Project V2 CRUD 与归档

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 M4（Project 部分）

## 要构建什么

新增 Project V2 领域：SQLite 持久化（或复用现有 JSON 项目存储 + V2 元数据包装），Project CRUD（创建/读取/更新/删除）、归档与恢复（软删除 + restore）、revision 乐观锁（PATCH 带 base_revision，冲突 409）、`GET/POST /api/v2/projects`、`GET/PATCH/DELETE /api/v2/projects/{id}`、`POST /api/v2/projects/{id}/restore`。第一版项目数据与旧前端 JSON 项目存储的互通策略需明确（ADR-001 禁止隐式双写：优先让 V2 项目独立持久化，或经明确兼容流程映射）。

## 索引的设计文档

- `docs/studio-v2-api-v2-p0-contract-and-openapi-design.md`（Project DTO、PATCH 语义、revision/ETag）
- `docs/studio-v2-backend-api-gap-and-v2-design.md`（Project V2 领域模型、Phase B2）
- `docs/current-backend-api-capability-inventory.md`（现有 `GET/POST /api/projects` 复用评估）
- `docs/adr-001-studio-v2-greenfield-frontend-and-additive-backend.md`（§4 数据边界、禁止隐式双写）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§7.1 项目保留矩阵）

## 验收标准

- [ ] 创建项目返回完整 Project DTO（含 revision），列表分页返回项目。
- [ ] 更新项目：不带 base_revision 返回校验错误；带过期 base_revision 返回 409 `PROJECT_REVISION_CONFLICT`；带正确 revision 更新成功且 revision 递增。
- [ ] 删除项目进入归档（软删除），列表默认不显示归档项目。
- [ ] `POST /restore` 恢复归档项目，恢复后列表可见。
- [ ] PATCH 区分"未提供字段"与"置 null"（字段语义正确）。
- [ ] 不存在项目返回 404 `PROJECT_NOT_FOUND`。
- [ ] 旧 `/api/projects` 行为不变（回归）。
- [ ] 后端测试：CRUD 往返、revision 冲突、归档/恢复、404 各一条用例。

## 被阻塞于

- [01-b1-v2-backend-skeleton](./01-b1-v2-backend-skeleton.md)
