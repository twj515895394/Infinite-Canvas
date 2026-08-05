# Infinite-Canvas 设计文档索引

> 日期：2026-08-05  
> 当前主题：Studio V2 前端重构与后端 API 演进

---

## 1. 阅读顺序

### 1.1 前端总体方向

[`studio-v2-frontend-architecture-overall-design.md`](./studio-v2-frontend-architecture-overall-design.md)

用于确定：

- 为什么不继续扩展原生 `canvas.js`。
- React + TypeScript + Vite + React Flow 技术选型。
- Studio V2 页面和工作区总体结构。
- 前端状态管理、性能和渐进迁移原则。
- Agent Runtime 外置复用边界。

### 1.2 当前后端 API 能力基线

[`current-backend-api-capability-inventory.md`](./current-backend-api-capability-inventory.md)

用于确定：

- 当前 FastAPI 已经具备的真实能力。
- 现有 API 分组和主要接口。
- 哪些接口可以直接复用。
- 哪些接口需要通过 V2 Adapter 包装。
- 当前接口在任务、画布、资产、事件和 Agent 方面的结构性限制。

### 1.3 Studio V2 后端 API 目标设计

[`studio-v2-backend-api-gap-and-v2-design.md`](./studio-v2-backend-api-gap-and-v2-design.md)

用于确定：

- 为什么后端不需要整体重写。
- `/api/v2` 的领域边界。
- P0、P1、P2 接口优先级。
- Project、Canvas、Asset、Artifact、GenerationJob 和 Agent Gateway 模型。
- 增量画布保存、统一任务和可恢复事件设计。
- Studio V2 前后端并行开发边界。

---

## 2. 当前已确定的核心决策

1. 保留 Python + FastAPI 后端。
2. Legacy API 与 Studio V2 API 并行。
3. 新前端使用 React + TypeScript + Vite。
4. 生产流程画布使用 React Flow。
5. 不继续把 `static/js/canvas.js` 作为长期主架构扩展。
6. 图片、视频、ComfyUI 和供应商任务统一为 GenerationJob。
7. 画布保存由全量快照演进为 Operation + Snapshot。
8. 素材演进为 Asset + AssetVersion + Reference。
9. 结构化成果使用 Artifact + Version + Link。
10. 实时事件使用 `/ws/v2/events`，支持 sequence 和断线补拉。
11. Agent Runtime 复用 Claude CLI、Codex CLI、Pi、oh-my-pi 等实现。
12. Infinite-Canvas 只实现 Agent Gateway、ACP/CLI Adapter、上下文、工具、事件和 Artifact 集成，不实现新的 Agent Harness。

---

## 3. 后续详细设计顺序

建议按以下顺序继续：

1. Studio V2 页面信息架构与核心用户流程。
2. `/api/v2` P0 DTO 与 OpenAPI 详细定义。
3. React Flow 节点模型、Node Registry 和 Inspector 设计。
4. Legacy Canvas JSON 到 V2 Document 的迁移映射。
5. Asset、AssetVersion、Artifact 和引用关系数据模型。
6. GenerationJob 状态机和供应商 Adapter 设计。
7. Studio Event Envelope、WebSocket 重连和补拉机制。
8. Agent Gateway、Skill Registry、Session、Task 和 Tool Gateway 设计。
9. UI Design Token 和 NodeCard 组件规范。
10. 分阶段实施任务、验收标准和开发里程碑。

---

## 4. 文档维护规则

- 总体架构决策修改时，先更新总体设计，再更新详细设计。
- 当前后端新增或删除 API 时，同步更新能力盘点文档。
- `/api/v2` Contract 修改时，必须同步更新 OpenAPI、前端 Zod Schema 和本目录设计文档。
- Legacy API 进入废弃状态时，记录替代接口和迁移期限。
- 供应商专用字段不得直接扩散到 Studio V2 公共 DTO。
