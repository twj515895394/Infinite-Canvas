# 12 - M9 ESM Deep Wire 热路径（选中 / 视口 / 连线走模块）

Status: ready-for-agent  
Type: issue  
Feature: legacy-frontend-enhancement-v3  
Slice: AFK

## 父问题

[PRD](../PRD.md) —— 模块 M9、用户故事 64–67

## 要构建什么

将 Smart Canvas **热路径**绞杀进已有 Native ESM 模块：选中态、视口平移缩放（RAF）、连线增量绘制、节点销毁时事件清理优先走 State Store / Render Engine / ConnectionLine / NodeFactory。采用双轨→切写→删重复，避免大爆炸重写。

保持零构建与 FastAPI 直托；过渡期保留必要 `window` / `SmartCanvasModules` 兼容导出。EventBus 事件名稳定并简短文档化。不借机引入打包器。

建议在 Status Bus（01）合并后进行，减少与运行态接线冲突。

## 索引的设计文档

- `.scratch/legacy-frontend-enhancement-v3/PRD.md`（M9）
- `docs/adr/0002-legacy-frontend-native-esm-refactoring.md`
- `.scratch/legacy-frontend-opt/` 前序切片（脚手架已存在）

## 验收标准

- [ ] 选中/框选变更经过 State Store（或明确委托），无第三份 selection 源长期分叉。
- [ ] 平移缩放走 ViewTransform + RAF；大图画布手感不差于改前。
- [ ] 拖节点时连线增量更新，非常规全量重绘闪烁回退。
- [ ] 删节点触发监听清理，无泄漏级重复绑定（抽查）。
- [ ] 页面无模块加载/CORS/MIME 回归；兼容钩子仍可用直至调用方迁完。
- [ ] 光标守护与 design-system 约定不被破坏。

## 被阻塞于

- [01-m3-node-run-status-bus](./01-m3-node-run-status-bus.md)（建议先合，降低冲突）
