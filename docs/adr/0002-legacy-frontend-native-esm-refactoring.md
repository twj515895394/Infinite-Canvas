# ADR 0002: 原生前端代码模块化与性能重构策略

- **状态**: 已接受 (Accepted)
- **日期**: 2026-08-06

## 1. 背景 (Context)

项目原有前端（位于 `static/` 目录）具备极其完备的 AI 无限画布与节点交互功能，但存在以下严重痛点：
1. `smart-canvas.js` 文件体积高达 982KB（单文件近万行），包含 DOM 渲染、全局状态、节点事件、API 接口调用等杂乱逻辑。
2. 缺乏状态管理与增量渲染，画布缩放平移及节点更新时易触发频繁 DOM 重排导致卡顿。
3. 原全新 React 重写版 (Studio V2) 尚未达到期望的 UI 体验与功能熟度。

用户决定暂停新 React 前端的替换，重回旧版原生 UI 进行深度的结构解耦与性能优化，且要求**不影响现有丰富功能的使用**。

## 2. 决策 (Decision)

1. **架构路线**: 采用 **原生 ES Modules (ESM)** 架构对 `static/js/smart-canvas.js` 进行拆分，保持 **0 打包工具（Zero-Build Tooling）** 依赖。
2. **切入顺序**: 优先攻坚 `static/js/smart-canvas.js` (982KB)，将其按职责切分为以下独立 ESM 模块（存放在 `static/js/modules/smart-canvas/`）：
   - `canvas-store.js`: 画布节点、连线、Viewport 集中状态管理与事件派发（EventBus）。
   - `canvas-render.js`: 画布 DOM 增量渲染与 `requestAnimationFrame` 平移缩放优化。
   - `canvas-events.js`: 画布拖拽、缩放、框选、键盘快捷键处理。
   - `canvas-nodes.js`: 节点模型定义与各节点 UI 组件渲染。
   - `canvas-api.js`: 异步 API 通信与 WebSocket/后端轮询。
3. **加载机制**: 在 `static/smart-canvas.html` 中通过 `<script type="module" src="./js/modules/smart-canvas/index.js"></script>` 进行主入口加载。

## 3. 权衡与后果 (Consequences)

### 正向收益
- **高可维护性**: 单文件拆分为独立小模块，修改节点或渲染逻辑不再牵一发而动全身。
- **性能显著提升**: DOM 增量渲染与 RAF 防抖消除画布拖拽缩放的帧率瓶颈。
- **平滑无缝过渡**: 无需 node_modules 构建链路，FastAPI 依然直接托管 `static/` 目录，修改保存后刷新即生效。

### 潜在限制
- 需要确保所有加载脚本遵循现代浏览器原生 ESM 规范。
- 拆分过程中需严格保持 API 契约与全局 Hook 的兼容性，避免破坏依赖全局变量的拓展脚本。
