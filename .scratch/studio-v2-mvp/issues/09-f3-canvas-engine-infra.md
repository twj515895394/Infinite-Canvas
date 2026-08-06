# 09 - 画布引擎基础设施（Node Registry + Editor Store + 节点渲染）

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F2（基础设施部分）、用户故事 5/7

## 要构建什么

React Flow 画布引擎基础设施：@xyflow/react 集成，单一稳定 `studio-node` Host（nodeTypes 冻结）；Node Registry 为唯一扩展入口（definition 含 schema/组件/inspector/ports/capabilities/validate/buildExecution/legacyAdapters，启动冻结 + 逐节点 Zod 迁移）；Zustand Editor Store 七分片（nodes/edges/selection/viewport/history/dirty/runtime）；MVP 节点集注册：Asset/Prompt/Image-Generation/Video-Generation/Workflow/Output/Group/Artifact（节点类型表达业务能力不表达供应商）；节点渲染、缩放/平移/框选、空画布状态；性能基线（100 节点流畅、拖拽不触发保存）。

## 索引的设计文档

- `docs/studio-v2-react-flow-node-model-and-registry-design.md`（五层节点模型、Registry Definition 生命周期、Editor Store 分片）
- `docs/studio-v2-frontend-architecture-overall-design.md`（四层架构、状态分离、性能预算）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§6.3 生成画布能力、§12 前端模块边界）

## 验收标准

- [ ] 画布可缩放/平移/框选；8 类 MVP 节点可创建并正确渲染（NodeCard 状态视觉统一）。
- [ ] Node Registry 冻结后不可动态注册；非法节点类型被拒绝（Zod 校验）。
- [ ] Editor Store 七分片职责正确；节点数据通过 schema 校验后入库。
- [ ] 节点类型体现业务能力，供应商信息仅存在于 config.executor/provider_id（无 midjourney/comfy 等类型名）。
- [ ] 100 节点场景操作流畅（无卡顿、无白屏）；拖拽节点不触发保存请求。
- [ ] Vitest：Registry 注册/冻结/非法节点拒绝用例。

## 被阻塞于

- [02-f1-frontend-scaffold-app-shell](./02-f1-frontend-scaffold-app-shell.md)
