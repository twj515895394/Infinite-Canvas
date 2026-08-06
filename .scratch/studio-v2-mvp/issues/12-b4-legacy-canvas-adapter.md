# 12 - LegacyCanvasAdapter 只读迁移

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 M4（Legacy 部分）、用户故事 9

## 要构建什么

Legacy 画布读取适配器：将旧前端画布 JSON（`data/canvases/`）两阶段只读转换为 V2 Canvas 模型——阶段一读取并校验，阶段二转换为 V2 Operation/快照。转换失败不影响新画布主流程，输出 Migration Report（成功项、失败项与原因）。明确不写回旧数据（ADR-001 禁止隐式双写）；提供"导入"入口而非默认路径。

## 索引的设计文档

- `docs/adr-001-studio-v2-greenfield-frontend-and-additive-backend.md`（§2.5 Legacy Canvas 兼容定位、§4 数据边界）
- `docs/studio-v2-react-flow-node-model-and-registry-design.md`（legacyAdapters、两阶段只读迁移、Migration Report）
- `docs/current-backend-api-capability-inventory.md`（旧画布存储结构、`/api/canvases/{id}` 兼容评估）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§7.1 画布保存重开一致）

## 验收标准

- [ ] 合法旧画布 JSON 可转换为 V2 画布并打开，节点/连线/位置信息一致。
- [ ] 非法/不完整旧画布返回明确错误，不崩溃、不产生半成品画布。
- [ ] 转换过程不写回旧数据（只读），旧文件校验和不变。
- [ ] Migration Report 列出成功/失败项与原因。
- [ ] 后端测试：合法转换、非法输入、不写回各一条用例。

## 被阻塞于

- [04-b3-canvas-v2-operations](./04-b3-canvas-v2-operations.md)
