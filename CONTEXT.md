# 项目领域上下文（CONTEXT.md）

## 领域词汇表 (Glossary)

### 1. 前端架构 (Frontend Architecture)

- **Legacy Frontend (`static/`)**：项目的原生主前端界面，由 HTML5、CSS3 和 Vanilla JavaScript 编写，由后端 FastAPI 直接提供静态文件托管。
- **Studio V2 (`studio-v2/`)**：尝试性的 React + React Flow 重写版本（已暂停主推，当前集中于 Legacy Frontend 性能与结构重构）。
- **Smart Canvas (`smart-canvas.html` / `smart-canvas.js`)**：旧版前端的核心 AI 无限画布，集成节点流、连线交互、提示词计算、多模型生成及工作流排版。

### 2. 模块化重构 (Native ESM Modularization)

- **Native ES Modules (原生 ESM)**：基于浏览器原生支持的 `import` / `export` 规范与 `<script type="module">` 进行代码拆分，无需 Node.js/Vite/Webpack 构建打包。
- **State Store (状态管理器)**：画布中的单向数据流与状态中心，解耦 DOM 渲染与业务逻辑。
- **Render Engine (渲染引擎)**：基于 `requestAnimationFrame` 防抖与增量 DOM 更新的画布渲染层。
