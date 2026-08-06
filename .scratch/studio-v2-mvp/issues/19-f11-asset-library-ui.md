# 19 - 资产库前端（浏览/上传导入/Tag/Collection/搜索/回收站）

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F4、用户故事 25-30

## 要构建什么

资产库页面：Grid/List 浏览、图片/视频预览（复用 10 号切片共享组件）、上传文件/导入本地/导入远程 URL、Tag 与 Collection 管理、搜索（名称/描述/标签）与类型筛选、重命名/描述编辑、删除到回收站与恢复、基础版本列表查看；调用 `/api/v2/assets` 系列接口（05 号切片）；资产虚拟化（性能预算）。

## 索引的设计文档

- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§6.4 资产库能力、§8 资产库 MVP）
- `docs/studio-v2-asset-artifact-version-reference-and-provenance-design.md`（Asset/Version/Tag/Collection 概念）
- `docs/studio-v2-frontend-architecture-overall-design.md`（资产虚拟化、性能预算）
- `docs/studio-v2-ui-interaction-and-motion-design-system.md`（MediaThumbnail 组件）

## 验收标准

- [ ] Grid/List 切换浏览正常；图片/视频预览可用；大量资产滚动流畅（虚拟化）。
- [ ] 上传/本地导入/远程 URL 导入均创建 Asset 并出现在列表。
- [ ] Tag 打标/移除、Collection 创建/改名/删除/归类可用。
- [ ] 搜索按名称/描述/标签命中；类型（kind）筛选正确。
- [ ] 重命名与描述编辑保存生效；版本列表可查看基础历史版本。
- [ ] 删除进回收站；回收站可恢复；恢复后列表可见。
- [ ] 空状态（无资产/无搜索结果）与错误状态完整。
- [ ] E2E：上传 → 打标 → 搜索命中 → 回收站 → 恢复闭环一次通过。

## 被阻塞于

- [10-f9-upload-media-preview](./10-f9-upload-media-preview.md)
- [05-b5-asset-backend](./05-b5-asset-backend.md)
