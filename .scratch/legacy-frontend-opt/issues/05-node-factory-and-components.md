---
title: 模块化 NodeFactory 与图片/提示词节点组件
labels: ready-for-agent
type: AFK
---

## 要构建什么

1. 创建 `static/js/modules/smart-canvas/nodes/node-factory.js` 统一处理节点的 DOM 构造。
2. 提取 `nodes/image-node.js`、`nodes/prompt-node.js`、`nodes/group-node.js` 等具体节点逻辑。
3. 剥离 `smart-canvas.js` 中大段內联 HTML 拼接字符串与独立节点的右键菜单绑定代码。

## 验收标准

- [ ] 各种节点类型（图片、提示词、分组、循环等）能够正常创建、编辑和渲染。
- [ ] 节点事件监听器在节点被删除时会自动进行内存销毁解绑，防止泄露。
- [ ] 主文件体积显著减少。

## 被阻塞于

- [03-centralized-state-store](03-centralized-state-store.md)
- [04-connection-line-incremental-render](04-connection-line-incremental-render.md)
