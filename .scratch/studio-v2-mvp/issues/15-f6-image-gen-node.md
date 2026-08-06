# 15 - 图片生成节点闭环（含即梦 Provider 选项）

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F3（图片生成部分）、用户故事 15/18/23

## 要构建什么

图片生成节点闭环：Image-Generation 节点（Prompt 输入、Provider/模型选择、参数配置）、提交生成（复用现有图片生成接口，轻量 Task 状态跟踪）、等待状态展示（Task Shelf 联动）、结果展示与重试、失败可重试、输出节点引用结果；即梦作为 Provider 选项（复用现有即梦接口）；基础 Task Shelf（运行/成功/失败状态，轮询现有接口或轻量任务状态，不要求完整 Event Hub）。

## 索引的设计文档

- `docs/current-backend-api-capability-inventory.md`（图片生成接口、即梦接口、任务状态接口复用评估）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§7.1 通用图片生成/即梦保留项、§7.2 简化方式：Task Shelf + 轮询）
- `docs/studio-v2-react-flow-node-model-and-registry-design.md`（节点运行态经 Job Reference 绑定、buildExecution）

## 验收标准

- [ ] 配置 Prompt/参数提交生成；提交后节点与 Task Shelf 显示等待/运行状态。
- [ ] 成功结果展示在节点/输出中；失败显示可理解错误并支持重试。
- [ ] 即梦 Provider 选项可选并执行（沿用现有可用入口）。
- [ ] 生成结果可被后续切片"输出入资产库"引用（返回稳定引用）。
- [ ] 生成期间可取消（若现有接口支持）；取消状态正确显示。
- [ ] 多次提交不串扰（每次任务独立状态）。
- [ ] E2E：提交图片生成 → 等待 → 结果展示 → 失败重试各一次。

## 被阻塞于

- [09-f3-canvas-engine-infra](./09-f3-canvas-engine-infra.md)
