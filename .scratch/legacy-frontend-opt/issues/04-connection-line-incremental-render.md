---
title: 重构 ConnectionLine 连线绘制与增量更新逻辑
labels: ready-for-agent
type: AFK
---

## 要构建什么

1. 创建 `static/js/modules/smart-canvas/render/connection-line.js`。
2. 将原本分散在主文件中的贝塞尔曲线 / 折线 SVG 计算抽离为独立的增量渲染模块。
3. 拖动单个节点时，仅增量重新计算和重绘与该节点相关的连线，未变动的连线保持不变。

## 验收标准

- [ ] 移动单节点时不再全量清空并重新生成 DOM 中的所有 SVG path。
- [ ] 连线输入/输出锚点抓取与线段高亮逻辑保持原样。
- [ ] 大量连线场景下拖拽卡顿明显减少。

## 被阻塞于

- [02-raf-view-transform-engine](02-raf-view-transform-engine.md)
- [03-centralized-state-store](03-centralized-state-store.md)
