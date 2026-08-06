# 17 - 画布持久化闭环（保存/重开/revision 冲突/Legacy 打开）

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F2（持久化部分）、用户故事 9/13/14

## 要构建什么

画布保存与恢复闭环：本地编辑（Command→Operation）批量发送到 `/api/v2/canvases/{id}/operations`（debounce + dirty set + operation_id 幂等）；打开画布时从 Snapshot + Operation 重建状态；revision 冲突（409 CANVAS_REVISION_CONFLICT）提示并重新加载；保存成功后 dirty 清除；从项目页可打开 Legacy 画布（经 12 号切片适配器）；深链接恢复画布工作区。

## 索引的设计文档

- `docs/studio-v2-frontend-architecture-overall-design.md`（保存策略：拖拽仅内存 transform、结束批量保存、debounce+dirty+revision 防覆盖）
- `docs/studio-v2-react-flow-node-model-and-registry-design.md`（Command→Operation 增量持久化、输入快照/Stale 提示）
- `docs/studio-v2-information-architecture-and-core-workflows.md`（状态恢复与连续性）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§7.1 画布保存重开一致、§7.2 revision 冲突简化）

## 验收标准

- [ ] 编辑后自动保存（debounce 批量），保存成功后 dirty 清除、revision 更新。
- [ ] 保存后重新打开画布内容一致（节点/连线/位置/参数）。
- [ ] 拖拽移动不触发保存请求，松开后批量保存（性能预算）。
- [ ] revision 冲突时弹出提示并提供重新加载，不静默覆盖。
- [ ] 打开 Legacy 画布（经适配器）成功且内容正确。
- [ ] 深链接 `/projects/:id/canvases/:cid` 刷新后恢复画布与选区。
- [ ] Vitest：Persistence 快照往返一致；E2E：编辑→保存→重开一致一次通过。

## 被阻塞于

- [14-f4-canvas-edit-undo-redo](./14-f4-canvas-edit-undo-redo.md)
- [04-b3-canvas-v2-operations](./04-b3-canvas-v2-operations.md)
- [12-b4-legacy-canvas-adapter](./12-b4-legacy-canvas-adapter.md)
