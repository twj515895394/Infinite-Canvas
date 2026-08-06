---
title: 搭建原生 ESM 模块加载主入口与解耦 EventBus
labels: ready-for-agent
type: AFK
---

## 要构建什么

在 `static/js/modules/smart-canvas/` 下建立 ESM 模块结构基座：
1. 创建 `core/event-bus.js` 提供轻量发布订阅功能。
2. 创建主入口文件 `index.js`，挂载全局 `window.smartCanvas` 兼容代理。
3. 修改 `static/smart-canvas.html` 的 JS 引用为原生 `<script type="module" src="/static/js/modules/smart-canvas/index.js"></script>`。

## 验收标准

- [ ] `static/smart-canvas.html` 可成功加载 ES 模块主入口而无 CROS 或 Mime-Type 报错。
- [ ] `EventBus` 支持 `on` / `off` / `emit` 机制并提供单元测试或行为验证。
- [ ] 原有全局 API（如 `window.nodes` 等）挂载完整，页面刷新后无脚本语法报错。

## 被阻塞于

无 - 可以立即开始
