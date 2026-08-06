# 21 - 资产拖入画布与生成结果自动入库

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F4/F3（打通部分）、用户故事 31/32

## 要构建什么

资产与画布/生成的双向打通：资产从资产库拖入画布生成 Asset 节点（节点引用明确 AssetVersion ID）；生成输出（图片/视频/ComfyUI/Codex）自动创建 Asset 并归档到资产库（"输出入资产库"操作，生成结果经 ingest 或直接创建 Asset + AssetVersion）；画布节点输出可再次拖入使用。

## 索引的设计文档

- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§8.2 生成结果自动创建 Asset、画布节点引用 AssetVersion、§6.3 拖入/输出归档）
- `docs/studio-v2-asset-artifact-version-reference-and-provenance-design.md`（节点 domain_ref 引用 AssetVersion、执行前固定 Pinned Version）
- `docs/studio-v2-react-flow-node-model-and-registry-design.md`（Asset 节点、Job 绑定）

## 验收标准

- [ ] 从资产库拖拽资产到画布创建 Asset 节点，节点引用 AssetVersion ID 而非路径。
- [ ] 生成结果可一键"保存到资产库"，创建 Asset + AssetVersion，预览图/元数据正确。
- [ ] 资产库新资产立即可见（无需刷新列表失效）。
- [ ] 已删除（回收站）资产拖入画布被拒绝或明确提示。
- [ ] E2E：资产拖入画布 → 生成 → 结果保存到资产库 → 新资产出现在资产库一次通过。

## 被阻塞于

- [19-f11-asset-library-ui](./19-f11-asset-library-ui.md)
- [17-f5-canvas-persistence](./17-f5-canvas-persistence.md)
- [05-b5-asset-backend](./05-b5-asset-backend.md)
