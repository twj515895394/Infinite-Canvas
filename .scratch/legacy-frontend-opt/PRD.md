# 旧版前端原生 ESM 模块化与性能重构 PRD

## 1. 目标

在保持现有 UI 视觉与全部功能 100% 正常使用的前提下，对旧版前端（`static/` 目录）的巨型单文件 `smart-canvas.js` (982KB) 进行代码解耦与性能优化。

## 2. 架构要点

- **0 构建工具依赖**: 采用原生 ES Modules (`<script type="module">`)
- **GPU 与 RAF 防抖**: 彻底解决画布拖拽平移与缩放卡顿
- **DOM 增量渲染**: 避免全量重绘
- **兼容性层**: 保持全局 `window` 对应 API 方法可访问，防止破坏已有内联回调

## 3. 切片列表 (Issues)

- [ ] [01-esm-module-base-and-eventbus](issues/01-esm-module-base-and-eventbus.md)
- [ ] [02-raf-view-transform-engine](issues/02-raf-view-transform-engine.md)
- [ ] [03-centralized-state-store](issues/03-centralized-state-store.md)
- [ ] [04-connection-line-incremental-render](issues/04-connection-line-incremental-render.md)
- [ ] [05-node-factory-and-components](issues/05-node-factory-and-components.md)
- [ ] [06-api-service-and-smoke-test](issues/06-api-service-and-smoke-test.md)
