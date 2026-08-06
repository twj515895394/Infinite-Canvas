# 23 - agent-task 画布节点

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F5（画布集成部分）、用户故事 45

## 要构建什么

画布基础 agent-task 节点：Agent 选择、Skill 选择、输入端口、输出文本或 Artifact 引用；节点不保存完整日志，只保存 Task ID 与最新结果引用（结果详情跳转 Agent Center/从 Dock 查看）；可编辑并重新执行。

## 索引的设计文档

- `docs/studio-v2-agent-skill-runtime-and-management-design.md`（画布 Agent Task Node 基础版）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§10.3 画布 agent-task 节点）
- `docs/studio-v2-react-flow-node-model-and-registry-design.md`（Agent-Task 节点延后说明：MVP 只做基础版、任务绑定）

## 验收标准

- [ ] 画布可创建 agent-task 节点，配置 Agent/Skill 与输入端口连接。
- [ ] 节点执行提交 Task，节点展示状态与最新结果引用（Task ID）。
- [ ] 点击结果可跳转查看 Task 详情（Agent Center 或 Dock）。
- [ ] 节点编辑后重新执行产生新 Task，旧结果引用保留在历史中。
- [ ] 无可用 Agent/Skill 时节点提示配置引导。
- [ ] E2E：画布创建 agent-task 节点 → 执行 → 查看结果一次通过。

## 被阻塞于

- [22-f14-agent-dock](./22-f14-agent-dock.md)
- [09-f3-canvas-engine-infra](./09-f3-canvas-engine-infra.md)
