# 06 - M4 Legacy V2 API Client（归一错误 / 幂等 / 测试）

Status: ready-for-agent  
Type: issue  
Feature: legacy-frontend-enhancement-v3  
Slice: AFK

## 父问题

[PRD](../PRD.md) —— 模块 M4、用户故事 28–30

## 要构建什么

在 Legacy Frontend 建立**唯一** `/api/v2` 访问模块（Native ESM）：Agent（runtimes/profiles/skills/sessions/tasks/events）、Assets（list/ingest/trash 等）、Generation tasks（供后续 Task Shelf）。统一 Epoch 毫秒、problem+json 错误归一（code/message/retryable）、写操作幂等键、FormData 不强制 JSON Content-Type、长任务 timeout。

禁止业务页面直接 `fetch('/api/v2/...')`。契约以已实现后端与 Studio V2 客户端语义为准，不发明第三套 DTO。本切片以 client + 单测为主，可不做业务 UI。

## 索引的设计文档

- `.scratch/legacy-frontend-enhancement-v3/PRD.md`（M4、测试决策 M4）
- `docs/studio-v2-api-v2-p0-contract-and-openapi-design.md`
- `docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md`
- Studio V2 `features/agents/api.ts` / `dockApi`（只读对照）

## 验收标准

- [ ] 单一模块导出 agents/assets/tasks（或等价命名空间），页面无散落 v2 URL。
- [ ] 错误归一：HTTP/problem 体映射为稳定对象；retryable 可区分。
- [ ] Task 类创建支持 Idempotency-Key；单测锁定头与复用语义（mock fetch）。
- [ ] FormData 请求不被强行加 `application/json`。
- [ ] M4 自动化测试通过。
- [ ] 不修改后端契约；发现缺口记入评论而非前端猜字段。

## 被阻塞于

无 - 可以立即开始
