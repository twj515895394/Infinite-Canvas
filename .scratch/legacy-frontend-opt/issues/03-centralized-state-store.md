---
title: 提炼 CanvasState 状态管理与 Undo/Redo 历史栈
labels: ready-for-agent
type: AFK
---

## 要构建什么

1. 创建 `static/js/modules/smart-canvas/core/canvas-state.js`。
2. 集中管理 `nodesMap`, `edgesMap`, `selectedNodeIds` 以及 `historyStack`。
3. 提供不可变/受控状态更新 API（如 `addNode`, `removeNode`, `updateNodePos`, `undo`, `redo`），触发 `EventBus` 通知渲染层。

## 验收标准

- [ ] 撤销 (Ctrl+Z) 与恢复 (Ctrl+Shift+Z) 可通过 StateStore 正确生效。
- [ ] 节点选择与多选 (Ctrl+BoxSelect) 状态收拢在 StateStore 中。
- [ ] 数据更新自动向渲染引擎抛出精准变动事件。

## 被阻塞于

- [01-esm-module-base-and-eventbus](01-esm-module-base-and-eventbus.md)
- [02-raf-view-transform-engine](02-raf-view-transform-engine.md)
