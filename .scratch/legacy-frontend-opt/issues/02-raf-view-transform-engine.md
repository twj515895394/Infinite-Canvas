---
title: 提炼 ViewTransform 渲染引擎并注入 requestAnimationFrame 防抖
labels: ready-for-agent
type: AFK
---

## 要构建什么

1. 创建 `static/js/modules/smart-canvas/render/view-transform.js`。
2. 封装 `scale`, `panX`, `panY` 变换状态与矩阵更新逻辑。
3. 拦截鼠标拖拽 (`mousemove`) 与滚轮 (`wheel`) 事件，统一由 `requestAnimationFrame` 驱动平移与缩放，引入 CSS `will-change: transform` 启发式硬件加速。

## 验收标准

- [ ] 画布拖拽与缩放不直接修改高频 DOM 样式，而是通过 RAF 进行统一帧同步刷新。
- [ ] 拖拽与缩放响应平滑，不再出现丢帧与撕裂。
- [ ] 维持画布缩放比例区间限制与原点聚焦逻辑与原代码完全一致。

## 被阻塞于

- [01-esm-module-base-and-eventbus](01-esm-module-base-and-eventbus.md)
