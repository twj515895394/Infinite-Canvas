# 01 - V2 后端骨架与契约基础设施

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 M1、总体架构（ADR-001）

## 要构建什么

在现有 FastAPI 后端之上新增独立 `/api/v2` 领域层骨架，作为所有 V2 接口的契约地基：统一 Pydantic DTO 约定、`ApiProblem` 错误模型、游标分页、`X-Client-Id` / `Idempotency-Key` / `If-Match`+revision 乐观锁基础设施、SQLite 初始化（`data/studio-v2/studio.db`，WAL/外键/Epoch 毫秒/前缀 UUID）。交付 `GET /api/v2/bootstrap` 与 `GET /api/v2/runtime-capabilities` 两个启动接口，验证骨架可运行且旧 `/api/*` 完全不受影响。

代码组织为独立模块（routers → services → adapters → repositories），不再堆进 main.py。

## 索引的设计文档

- `docs/README.md`（决策优先级与文档导航）
- `docs/adr-001-studio-v2-greenfield-frontend-and-additive-backend.md`（/api/v2 边界规则）
- `docs/studio-v2-api-v2-p0-contract-and-openapi-design.md`（P0 契约：ApiProblem、分页、幂等、revision、ID 前缀）
- `docs/studio-v2-backend-api-gap-and-v2-design.md`（B0/B1 实施顺序）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§11 最少新增 API、§5.2 数据存储）

## 验收标准

- [ ] 新增 `/api/v2/*` 路由可访问，`GET /api/v2/bootstrap` 返回前端初始化所需配置（snake_case、ISO 8601）。
- [ ] `GET /api/v2/runtime-capabilities` 返回探测结果聚合（Provider/CLI 可用性、版本、能力列表），无探测数据时返回空能力而非报错。
- [ ] 错误响应统一为 `application/problem+json` 的 `ApiProblem{type,title,status,detail,code,request_id,retryable,field_errors,context}`；校验失败返回 422/400 且带 `field_errors`。
- [ ] 游标分页基础设施可用：`PageInfo{next_cursor,has_more,limit,total}`，limit 默认 50 最大 200，非法 limit 返回校验错误。
- [ ] `Idempotency-Key` 基础设施可用：同 key 重复请求返回同一结果，冲突返回 409 `IDEMPOTENCY_CONFLICT`。
- [ ] SQLite 初始化成功：建库建表、外键开启、WAL 模式、带前缀 UUID 生成器可用。
- [ ] 旧 `/api/*` 全部接口回归无变化（openapi.json 旧路径快照对比）。
- [ ] 新增接口全部有 Pydantic Response Model，`/api/v2` 出现在 OpenAPI 中。

## 被阻塞于

无 - 可以立即开始
