# 10 - M7 Asset V2 Bridge（库 UI 桥 + 拖入 version 引用）

Status: ready-for-agent  
Type: issue  
Feature: legacy-frontend-enhancement-v3  
Slice: AFK

## 父问题

[PRD](../PRD.md) —— 模块 M7、用户故事 53–59

## 要构建什么

以现有素材库 UI 为壳，经 M4 桥接 **Asset V2**（版本、标签、Collection、回收站/恢复）。上传/导入写入 V2（或明确的单向桥接策略）。拖入 Smart Canvas 时节点持 **AssetVersion** 稳定引用，而非仅易变 URL。生成结果可一键/自动入库。

旧 `asset_library.json` 数据：只读兼容或迁移提示，**禁止无说明静默双写分叉**。Purge/占用冲突展示后端可读错误。本切片不要求做完所有企业级 provenance。

## 索引的设计文档

- `.scratch/legacy-frontend-enhancement-v3/PRD.md`（M7）
- `docs/studio-v2-asset-artifact-version-reference-and-provenance-design.md`（子集）
- 现有素材库页面行为

## 验收标准

- [ ] 素材库可浏览 V2 资产；上传/导入后列表可见。
- [ ] 支持标签/Collection/类型筛选中与后端已暴露能力对齐的部分。
- [ ] 删除进回收站可恢复。
- [ ] 可查看基础版本列表。
- [ ] 拖入画布的节点带 asset_version（或等价）引用。
- [ ] 生成结果入库主路径可用。
- [ ] 旧数据可见性有明确策略（兼容或提示），无静默丢数据。
- [ ] 请求经 M4。

## 被阻塞于

- [06-m4-legacy-v2-api-client](./06-m4-legacy-v2-api-client.md)
