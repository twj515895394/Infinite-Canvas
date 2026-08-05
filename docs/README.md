# Infinite-Canvas 设计文档索引

> 日期：2026-08-05  
> 当前主题：Studio V2 Greenfield 前端、Agent/Skill 平台、UI 设计系统、画布节点体系与增量后端演进

---

## 1. 阅读顺序

### 1.1 最高优先级架构决策

[`adr-001-studio-v2-greenfield-frontend-and-additive-backend.md`](./adr-001-studio-v2-greenfield-frontend-and-additive-backend.md)

用于确定：

- Studio V2 是完全独立建设的 Greenfield 新前端。
- 不把现有 `canvas.js` 机械翻译为 React，也不以旧前端代码迁移作为建设路径。
- 旧前端和 Studio V2 在过渡期独立运行。
- 现有 `/api/*` 接口保持兼容。
- 新能力通过 `/api/v2/*`、`/ws/v2/*` 和后端内部 Adapter 增量提供。
- Legacy Canvas 导入是可选兼容专题，不阻塞 Studio V2 主流程。
- Agent、Skill、Runtime、Tool、Permission 和 Artifact 的优先级高于 Legacy Canvas 全量迁移。

> 当其他文档中的“渐进迁移”“新旧并行”或“Legacy Adapter”描述与本 ADR 存在歧义时，以本 ADR 为准。

### 1.2 前端总体方向

[`studio-v2-frontend-architecture-overall-design.md`](./studio-v2-frontend-architecture-overall-design.md)

用于确定：

- 为什么不继续扩展原生 `canvas.js`。
- React + TypeScript + Vite + React Flow 技术路线。
- Studio V2 工作区总体结构。
- 前端状态管理和性能原则。
- Agent Runtime 外置复用边界。

> 说明一：总体设计中“渐进迁移”应理解为功能分阶段建设和用户逐步切换，不是逐段改写旧前端。  
> 说明二：总体设计中的 UI primitives 初始建议为 Radix UI，最终选型已经调整为 shadcn/ui Base UI 版本 + Base UI primitives，详细决策以 UI 专项设计为准。

### 1.3 当前后端 API 能力基线

[`current-backend-api-capability-inventory.md`](./current-backend-api-capability-inventory.md)

用于确定：

- 当前 FastAPI 已经具备的真实能力。
- 现有 API 分组和主要接口。
- 哪些底层能力可以直接复用。
- 哪些能力需要通过 V2 Adapter 包装。
- 当前接口在任务、画布、资产、事件和 Agent 方面的结构性限制。

### 1.4 Studio V2 后端 API 目标设计

[`studio-v2-backend-api-gap-and-v2-design.md`](./studio-v2-backend-api-gap-and-v2-design.md)

用于确定：

- 为什么后端不需要整体重写。
- `/api/v2` 的领域边界。
- P0、P1、P2 接口优先级。
- Project、Canvas、Asset、Artifact、GenerationJob 和 Agent Gateway 模型。
- 增量画布保存、统一任务和可恢复事件设计。
- Studio V2 前后端并行开发边界。

### 1.5 页面信息架构与核心流程

[`studio-v2-information-architecture-and-core-workflows.md`](./studio-v2-information-architecture-and-core-workflows.md)

用于确定：

- App Shell 的 Top Bar、Navigation、Main Workspace、Inspector 和 Task Shelf。
- 项目、素材、剧本、角色、场景、镜头、分镜、生成流程与 Agent 的页面关系。
- 路由、导航、Command Palette 和上下文恢复。
- 从项目到生成、从剧本到镜头、从素材到角色、Agent Artifact 回写等核心流程。
- 第一阶段实际需要建设的页面范围。

### 1.6 UI、交互与动效设计系统

[`studio-v2-ui-interaction-and-motion-design-system.md`](./studio-v2-ui-interaction-and-motion-design-system.md)

用于确定：

- 简洁、克制、专业、即时响应的视觉方向。
- 从 Apple Design 与 Emil Kowalski 设计工程方法中吸收的交互原则。
- Tailwind CSS + shadcn/ui Base UI + Base UI primitives + Motion for React 最终选型。
- Color、Typography、Spacing、Radius、Elevation 和 Motion Token。
- Button、Popover、Dialog、Sheet、Inspector、NodeCard、Asset Preview 和 Agent UI 的状态与动效。
- React Flow 与动效库之间的性能边界。
- Reduced Motion、High Contrast 和 UI 验收规则。

### 1.7 `/api/v2` P0 Contract 与 OpenAPI

[`studio-v2-api-v2-p0-contract-and-openapi-design.md`](./studio-v2-api-v2-p0-contract-and-openapi-design.md)

用于确定：

- Pydantic、OpenAPI、TypeScript 和 Zod 的 Schema 来源关系。
- HTTP Header、Status、Problem Detail、Cursor Pagination 和幂等规则。
- Bootstrap、Runtime Capability 和 Project DTO。
- Canvas Document、Operation、Snapshot 和 Revision 冲突处理。
- Asset Query、Asset Ingest 和 AssetVersion 摘要。
- Unified GenerationJob、Attempt、Cancel 和 Retry。
- Studio Event Envelope、WebSocket、Heartbeat 和 Replay。
- P0 后端模块结构、持久化最低要求、测试和实施顺序。

### 1.8 React Flow 节点模型与 Node Registry

[`studio-v2-react-flow-node-model-and-registry-design.md`](./studio-v2-react-flow-node-model-and-registry-design.md)

用于确定：

- StudioCanvasDocument、StudioCanvasNode 和 StudioCanvasEdge。
- React Flow DTO 与领域模型的 Adapter 边界。
- 单一稳定 `studio-node` Host 和 Node Registry 扩展机制。
- Node Kind、Definition Version、Config、Bindings 和 Presentation 分层。
- 强类型 Port、Handle、连接兼容矩阵和 Cycle Policy。
- Asset、Prompt、Batch、Image/Video Generation、Workflow、Agent Task、Shot、Artifact、Output 和 Group 节点。
- Inspector、NodeFrame、Contextual Zoom 和 Validation。
- Command System、Undo/Redo、Clipboard、Duplicate、Selection 和 Grouping。
- GenerationJob 绑定、Input Snapshot、Stale 状态和级联执行边界。
- Legacy Canvas 节点映射与 Legacy Node 降级兼容。

### 1.9 Agent、Skill、Runtime 与管理系统

[`studio-v2-agent-skill-runtime-and-management-design.md`](./studio-v2-agent-skill-runtime-and-management-design.md)

用于确定：

- Agent Runtime、Runtime Profile、Agent Profile、Skill、Session、Task、Run 和 Step 的领域边界。
- Agent 与 Skill 的多对多绑定和 Skill Version 固定规则。
- Skill Package、`skill.yaml`、`SKILL.md`、输入输出 Schema、执行模式和来源管理。
- ACP、CLI JSONL、CLI stdio、HTTP Runtime Adapter。
- Context Builder、Context Chip 和 Context Snapshot。
- Tool Gateway、Tool Registry、Tool Call 和 Permission Request。
- Artifact 输出、版本来源和领域对象回写。
- Agent Center、Agents、Skills、Runtimes、Tasks、Permissions 和 Agent Dock 页面设计。
- Agent Task Node 与服务端 Task 的绑定。
- `/api/v2` Agent、Skill、Runtime、Session、Task、Permission、Tool 和 Context 接口。
- P0、P1、P2 实施边界与首批内置 Skill。

---

## 2. 当前已确定的核心决策

1. Studio V2 是独立 Greenfield 前端，不以旧前端代码迁移为建设路径。
2. 旧前端和 Studio V2 在过渡期独立运行。
3. 保留 Python + FastAPI 后端，现有 `/api/*` 保持兼容。
4. 新能力通过 `/api/v2/*`、`/ws/v2/*` 和内部 Adapter 增量提供。
5. Studio V2 不隐式双写 Legacy Canvas 数据；Legacy 导入是可选兼容能力。
6. 新前端使用 React + TypeScript + Vite。
7. 生产流程画布使用 `@xyflow/react`。
8. 不继续把 `static/js/canvas.js` 作为长期主架构扩展。
9. 页面采用稳定的 App Shell：Navigation + Main Workspace + Inspector + Task Shelf。
10. UI primitives 使用 Base UI，组件源码基座使用 shadcn/ui Base UI 版本。
11. 高频微交互使用 CSS Transition 和 Base UI 状态；复杂可中断动效使用 Motion for React。
12. React Flow 节点位置更新不套 Motion Layout，UI 动效不得牺牲画布性能。
13. UI 参考 Apple Design 的响应、连续性、空间关系和克制原则，但不复制 Apple 产品外观。
14. React Flow 只注册一个稳定的 `studio-node` Host，业务节点通过 Node Registry 扩展。
15. 顶层 Node Kind 描述业务能力，不使用 Midjourney、RunningHub、ComfyUI 等供应商名称。
16. 节点配置、布局、领域引用、运行任务和临时 UI 状态严格分离。
17. 端口使用强类型 Port Definition，连接统一通过 Connection Policy 校验。
18. 可撤销编辑统一通过 Command System；Canvas Undo 不撤销已提交的外部任务。
19. 图片、视频、ComfyUI 和供应商任务统一为 GenerationJob。
20. 画布保存由全量快照演进为 Operation + Snapshot。
21. 素材演进为 Asset + AssetVersion + Reference。
22. 结构化成果使用 Artifact + Version + Link。
23. 实时事件使用 `/ws/v2/events`，支持 sequence 和断线补拉。
24. `/api/v2` 使用 Pydantic Response Model 和稳定 OpenAPI，不使用裸顶层 `dict`。
25. Agent Runtime 复用 Claude CLI、Codex CLI、Gemini CLI、Pi、oh-my-pi 和 ACP 等实现。
26. Infinite-Canvas 实现 Agent Control Plane：Profile、Skill、Context、Tool、Permission、Task、Artifact 和 Event，不实现新的 Agent Harness。
27. Agent 是执行者配置，Skill 是版本化能力定义，两者独立管理和多对多绑定。
28. 所有 Agent 执行必须 Task / Run 化，并固定 Agent Revision、Skill Version 和 Context Snapshot。
29. 所有副作用操作必须经过 Tool Gateway 或明确 Runtime 权限策略。
30. 结构化 Agent 输出优先 Artifact 化，再由用户确认写回项目领域对象。

---

## 3. 当前文档完成状态

| 设计项 | 状态 |
|---|---|
| Greenfield 前端与增量后端 ADR | 已完成 Accepted |
| 前端总体架构 | 已完成 v1.0 |
| 当前后端 API 能力盘点 | 已完成 v1.0 |
| Studio V2 后端 API 总体设计 | 已完成 v1.0 |
| 页面信息架构与核心流程 | 已完成 v1.0 |
| UI、交互与动效设计系统 | 已完成 v1.0 |
| `/api/v2` P0 DTO 与 OpenAPI | 已完成 v1.0 |
| React Flow 节点模型与 Node Registry | 已完成 v1.0 |
| Agent、Skill、Runtime 与管理系统 | 已完成 v1.0 |
| Asset / Artifact 数据模型 | 待设计 |
| GenerationJob 状态机 | 节点绑定已定义，完整状态机和 Adapter 待设计 |
| Event Hub 详细协议 | P0 已定义，扩展细节待设计 |
| AI 影视创作领域对象 | 总体模型已定义，字段与流程待细化 |
| Legacy Canvas 可选导入 | 节点级映射已定义，导入报告和回滚后续设计 |
| 实施任务和里程碑 | 待设计 |

---

## 4. 后续详细设计顺序

按当前产品优先级继续：

1. Agent/Skill P0 DTO、数据库表、事件和 Runtime Adapter 逐字段 Contract。
2. Asset、AssetVersion、Artifact、ArtifactVersion 和引用关系数据模型。
3. GenerationJob 状态机、Attempt、Executor 和供应商 Adapter 设计。
4. Studio Event 的持久化、聚合、限流和重连实现细节。
5. Project Bible、Script、Character、Scene、Shot 和 Storyboard 详细领域设计。
6. 可交互 UI Prototype、Agent Center 原型、组件 Storybook 和 React Flow 性能原型。
7. 分阶段实施任务、依赖关系、验收标准和开发里程碑。
8. Legacy Canvas 可选导入、迁移报告和失败回滚。

---

## 5. 决策优先级

当文档出现不一致时，按以下优先级处理：

```text
Accepted ADR
> 最新专项详细设计
> 最新总体设计补充
> 前端总体设计
> 现有实现
```

已经明确被 ADR 或后续文档修订的选型，不再以旧文档中的初始建议为准。

---

## 6. 文档维护规则

- 总体架构决策修改时，必须新增或更新 ADR，并记录受影响文档。
- 当前后端新增或删除 API 时，同步更新能力盘点文档。
- 旧 `/api/*` 修改时必须进行兼容性评估。
- `/api/v2` Contract 修改时，必须同步更新 OpenAPI、前端 TypeScript 类型、关键 Zod Schema 和本目录设计文档。
- Agent Profile、Skill、Runtime、Tool 或 Permission Contract 修改时，必须同步管理 UI、事件和审计用例。
- Skill Manifest 修改时必须同步版本规则、Validator 和测试样例。
- Node Definition 修改时，必须同步 Definition Version、迁移函数、Inspector、Port 和测试。
- 新增 Provider 或 Executor 时，优先扩展 Adapter，不得默认增加新的顶层 Node Kind。
- Design Token 和 Motion Token 修改时，必须同步组件 Story 和视觉回归用例。
- Legacy API 进入废弃状态时，记录替代接口和迁移期限。
- 供应商专用字段不得直接扩散到 Studio V2 公共 DTO。
- UI 评审意见必须说明可用性、连续性、可访问性或性能原因，不能只用“更高级”“更好看”作为结论。
