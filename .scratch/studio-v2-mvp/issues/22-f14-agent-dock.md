# 22 - Agent Dock（任务流/上下文/流式/取消/结果保存）

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F5（Dock 部分）、用户故事 40-44/46/47

## 要构建什么

Agent Dock 面板：从生成画布、资产库、Agent Center 测试页可打开；流程——选择 Agent → 选择/指定 Skill → 输入任务 → 添加资产上下文（AssetVersion 多选）与当前画布选中节点上下文 → 启动任务 → 查看流式/阶段性输出（SSE/轮询）→ 取消 → 查看最终结果 → 保存为文本/JSON Artifact 或导入资产库；资产库中"选中素材 → 使用 Agent"入口；任务失败显示可理解错误；重启后历史任务仍可见。

## 索引的设计文档

- `docs/studio-v2-agent-skill-runtime-and-management-design.md`（Agent Dock 基础版、Artifact 输出）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§6.6 Agent Dock、§10 Agent 应用入口）
- `docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md`（Task 事件流、context_snapshots/context_references）

## 验收标准

- [ ] Dock 从画布/资产库/Agent Center 三处均可打开，上下文自动带入。
- [ ] 选择 Agent + Skill + 输入任务 → 启动；资产与画布选中节点作为 Context 正确提交。
- [ ] 流式/阶段性输出实时显示（轮询或 SSE）；运行中可取消，取消状态正确。
- [ ] 结果可保存为 Artifact（文本/JSON）或导入资产库，成功后可见。
- [ ] 失败显示可理解错误；重启后任务历史可见。
- [ ] 资产库选中素材 → "使用 Agent" → 任务执行闭环可用。
- [ ] E2E：画布中打开 Dock → 选 Agent/Skill → 加资产上下文 → 提交 → 流式 → 结果保存 Artifact 一次通过。

## 被阻塞于

- [20-f13-agent-center-ui](./20-f13-agent-center-ui.md)
- [13-b8-agent-task-execution](./13-b8-agent-task-execution.md)
- [21-f12-asset-drag-output-archive](./21-f12-asset-drag-output-archive.md)
