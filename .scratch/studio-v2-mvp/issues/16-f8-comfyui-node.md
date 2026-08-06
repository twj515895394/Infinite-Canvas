# 16 - ComfyUI 工作流节点

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F3（ComfyUI 部分）、用户故事 17

## 要构建什么

ComfyUI 工作流节点：Workflow 节点选择工作流（复用 `/api/workflows`）、配置参数（节点参数映射）、执行并获取输出、状态展示与失败重试；设置页已有 ComfyUI 相关配置入口联动。供应商特有字段在 Adapter/Feature API 层转换，不扩散到通用节点组件。

## 索引的设计文档

- `docs/current-backend-api-capability-inventory.md`（`/api/workflows`、`/api/workflows/{name}`、comfyui 执行接口复用评估）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§7.1 ComfyUI 保留项）
- `docs/studio-v2-react-flow-node-model-and-registry-design.md`（Workflow 节点类型、config.executor 表达供应商）

## 验收标准

- [ ] 可选择已注册工作流并展示工作流基本信息。
- [ ] 配置参数后执行；等待/运行/成功/失败状态正确展示。
- [ ] 输出可被画布引用（Job Reference），失败可重试。
- [ ] 供应商字段仅存在于节点 config，通用组件无 comfyui 特化逻辑。
- [ ] 无可用工作流时显示空状态引导配置。
- [ ] E2E：选择工作流 → 配参 → 运行 → 输出展示一次通过。

## 被阻塞于

- [09-f3-canvas-engine-infra](./09-f3-canvas-engine-infra.md)
