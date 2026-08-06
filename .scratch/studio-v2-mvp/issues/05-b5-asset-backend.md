# 05 - Asset 后端（CRUD + Ingest + 版本 + 回收站）

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 M2

## 要构建什么

Asset 领域后端（深模块）：SQLite 表 `assets`/`asset_versions`/`asset_tags`/`asset_tag_links`/`asset_collections`/`asset_collection_members`；Asset（kind=image/video/audio/document/workflow/archive，lifecycle=active/archived/trashed/purging/purged）+ AssetVersion（创建后不可变，含 file_path/preview_url/mime_type/width/height/duration_ms/size_bytes/source_metadata）+ Tag + Collection。接口：`GET /api/v2/assets`（游标分页+筛选 kind/status/tag/collection/搜索 name/description/tag）、`GET/PATCH/DELETE /api/v2/assets/{id}`、`POST /api/v2/assets/{id}/restore`、`GET/POST /api/v2/assets/{id}/versions`、`POST /api/v2/assets/ingest/upload`（multipart）、`POST /api/v2/assets/ingest`（remote_url/local_file/shared_folder 源）、`/api/v2/asset-collections` CRUD。回收站：Trash 不破坏引用（引用仍可解析、可 Restore）；Purge 前检查 Hard Reference，存在返回 409 `ASSET_IN_USE`。素材文件存本地目录（沿用当前 uploads/output 结构），数据库保存稳定 ID 与路径引用。

## 索引的设计文档

- `docs/studio-v2-asset-artifact-version-reference-and-provenance-design.md`（Asset 核心模型、版本不变性、回收站规则、MVP 裁剪）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§8 资产库 MVP 范围、§11.1 Asset API 清单）
- `docs/studio-v2-api-v2-p0-contract-and-openapi-design.md`（Asset DTO、ingest、分页、ApiProblem）
- `docs/current-backend-api-capability-inventory.md`（现有 /api/ai/upload、local-assets、asset-library 复用评估）

## 验收标准

- [ ] upload/remote_url/local_file/shared_folder 四种 ingest 源都能创建 Asset + 首个 AssetVersion，文件落到本地目录。
- [ ] AssetVersion 创建后不可变（不可修改/删除已有版本内容）。
- [ ] 追加版本：`POST /api/v2/assets/{id}/versions` 创建新版本，current_version_id 更新，历史版本列表完整。
- [ ] 搜索按名称/描述/标签命中；筛选 kind/status/collection 生效；游标分页正确（has_more/next_cursor）。
- [ ] 删除进回收站（trashed），列表隐藏；`restore` 恢复；Purge 存在 Hard Reference（被画布节点/Agent Run 引用）返回 409 `ASSET_IN_USE`。
- [ ] Tag 与 Collection 组合使用，Collection CRUD 可用。
- [ ] 不存在资产返回 404 `ASSET_NOT_FOUND`；PATCH 区分未提供与置 null。
- [ ] 后端测试：四种 ingest、版本不可变、回收站/恢复/Purge 冲突、搜索筛选、分页各一条用例。

## 被阻塞于

- [01-b1-v2-backend-skeleton](./01-b1-v2-backend-skeleton.md)
