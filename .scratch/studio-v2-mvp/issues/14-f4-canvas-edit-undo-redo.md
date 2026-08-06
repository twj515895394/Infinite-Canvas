# 14 - 画布编辑与 Undo/Redo（Command System）

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F2（编辑部分）、用户故事 5/6/8/10

## 要构建什么

画布编辑能力：节点创建/删除/移动/复制、连线创建/删除、Inspector 编辑节点参数；Command System 驱动 Undo/Redo（13 类第一版命令，拖拽手势合并为单命令，Undo 不撤销已提交外部任务）；强类型 Port + 连接验证（9 步校验：类型/方向/环/重复等）；自定义 Clipboard 格式（复制/剪切/粘贴节点与连线）；编辑操作转为 Command→Operation 待持久化（由 17 号切片发送）。

## 索引的设计文档

- `docs/studio-v2-react-flow-node-model-and-registry-design.md`（Command System、13 类命令、Port 类型系统与 9 步连接验证、Clipboard）
- `docs/studio-v2-frontend-architecture-overall-design.md`（Zustand Editor Store、Undo/Redo 边界）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§6.3 画布编辑、§7.1 Undo/Redo 至少覆盖本地编辑）

## 验收标准

- [ ] 节点创建/删除/移动/复制、连线创建/删除均可用；Inspector 编辑参数生效。
- [ ] Undo/Redo 覆盖本地编辑（含多步连续操作），拖拽移动合并为单步撤销。
- [ ] 已提交外部任务（生成/Agent）的节点，Undo 不撤销已提交任务。
- [ ] Port 连接 9 步校验生效：类型不匹配/方向错误/自环/重复连接被拒绝并有提示。
- [ ] Clipboard 复制/剪切/粘贴节点与连线（含端口引用）正确，跨画布粘贴不残留非法引用。
- [ ] 编辑产生 dirty 标记，未保存状态有视觉提示。
- [ ] Vitest：命令 Undo/Redo 语义（含拖拽合并）、Port 校验、Clipboard 往返用例。

## 被阻塞于

- [09-f3-canvas-engine-infra](./09-f3-canvas-engine-infra.md)
