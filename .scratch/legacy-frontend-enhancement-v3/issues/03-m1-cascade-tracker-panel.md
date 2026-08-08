# 03 - M1 级联追踪面板 UI + 接 Status Bus

Status: ready-for-agent  
Type: issue  
Feature: legacy-frontend-enhancement-v3  
Slice: AFK

## 父问题

[PRD](../PRD.md) —— 模块 M1、用户故事 5–6、9–10、12

## 要构建什么

在 Smart Canvas 提供可演示的**级联追踪面板**：展示当前/最近一次级联中各节点状态、轮次序号、边等待/激活/完成、可读错误摘要、停止操作。启动入口继续复用现有 Composer 级联按钮与循环节点「一键运行」，不发明第二套启动语义。

面板与节点徽章/连线一律订阅 Status Bus（01）与 Cascade Tracker 投影（02）。级联进行中仍允许对其它无关节点单独生成。支持减少动效时关闭边闪烁。运行结束后保留摘要直至下次启动或手动清除。

样式收口 design-system，避免行内样式堆砌（动态位置除外）。

## 索引的设计文档

- `.scratch/legacy-frontend-enhancement-v3/PRD.md`（M1 UI、冒烟清单第 1 条）
- `docs/adr/0002-legacy-frontend-native-esm-refactoring.md`（样式与光标约定）

## 验收标准

- [ ] 选中可级联尾节点并启动后，面板列出链路节点及状态变化。
- [ ] 可从面板或既有入口停止；stopping 态可见。
- [ ] 失败节点展示可读错误摘要（非空白/非原始堆栈刷屏）。
- [ ] 边状态与节点状态同源，无「节点失败边仍 active」的明显不一致。
- [ ] 级联中可对其它无关节点点生成（回归既有行为）。
- [ ] 减少动效下边动画关闭或降级。
- [ ] 结束后摘要可保留并在下次 start 或清除后更新。

## 被阻塞于

- [01-m3-node-run-status-bus](./01-m3-node-run-status-bus.md)
- [02-m1-cascade-tracker-logic](./02-m1-cascade-tracker-logic.md)
