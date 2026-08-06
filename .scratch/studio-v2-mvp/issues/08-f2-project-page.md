# 08 - 项目页前端（列表/创建/打开/重命名/删除/归档）

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F1（项目页）、用户故事 3/4

## 要构建什么

新前端项目首页：项目列表（含最近项目分组）、创建项目（对话框）、打开项目（进入画布工作区）、重命名、删除（归档确认对话框）、归档项目浏览与恢复；加载/错误/空状态；路由 `/projects`、`/projects/:id`；通过 Feature API 层调用 `/api/v2/projects`，供应商字段不扩散。

## 索引的设计文档

- `docs/studio-v2-information-architecture-and-core-workflows.md`（项目首页 IA、核心流程）
- `docs/studio-v2-frontend-architecture-overall-design.md`（Feature API 层、TanStack Query 用法）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§6.2 项目首页能力）

## 验收标准

- [ ] 项目列表展示、分页/最近分组正确；创建项目后立即出现在列表。
- [ ] 打开项目跳转画布工作区，URL 为 `/projects/:id` 可恢复。
- [ ] 重命名、删除（确认后归档）、恢复归档项目均生效。
- [ ] 删除/归档等破坏性操作有确认对话框（用户故事 50）。
- [ ] 列表加载失败显示 Error 状态可重试；无项目显示 Empty 状态。
- [ ] 通过 Feature API 层调用，组件内无直接 fetch。
- [ ] E2E：创建 → 打开 → 重命名 → 删除 → 恢复闭环一次通过。

## 被阻塞于

- [02-f1-frontend-scaffold-app-shell](./02-f1-frontend-scaffold-app-shell.md)
- [03-b2-project-v2-crud](./03-b2-project-v2-crud.md)
