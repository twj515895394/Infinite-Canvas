---
title: 抽离 CanvasAPI 与集成冒烟测试
labels: ready-for-agent
type: AFK
---

## 要构建什么

1. 创建 `static/js/modules/smart-canvas/api/canvas-api.js`，将后端 FastAPI/WebSocket 的异步通信抽离收拢。
2. 完成主文件 `smart-canvas.js` 到 ESM 模块的全面过渡替代。
3. 执行集成冒烟测试：针对创建节点、拖拽缩放、提示词增强、AI 生成运行、保存工作流进行端到端全量功能防退化验证。

## 验收标准

- [ ] 智能画布全部生成功能（API 生成、ComfyUI、RunningHub 等）正常运行。
- [ ] 工作流导入导出与资产库交互无退化故障。
- [ ] 画布流畅度与响应速度达到预期（拖拽平滑、缩放零撕裂）。

## 被阻塞于

- [01-esm-module-base-and-eventbus](01-esm-module-base-and-eventbus.md)
- [02-raf-view-transform-engine](02-raf-view-transform-engine.md)
- [03-centralized-state-store](03-centralized-state-store.md)
- [04-connection-line-incremental-render](04-connection-line-incremental-render.md)
- [05-node-factory-and-components](05-node-factory-and-components.md)
