# Infinite-Canvas 设计文档索引

> 日期：2026-08-05  
> 当前主题：Studio V2 Greenfield 前端、Agent/Skill 平台、资源版本体系、画布节点体系与增量后端演进

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
- Agent、Skill、Runtime、Tool、Permission、Asset 和 Artifact 的优先级高于 Legacy 全量迁移。

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

### 1.10 Agent / Skill P0 Contract、SQLite 与 Runtime Adapter

[`studio-v2-agent-skill-p0-contract-and-sqlite-design.md`](./studio-v2-agent-skill-p0-contract-and-sqlite-design.md)

用于确定：

- `data/studio-v2/studio.db`、WAL、短事务、Repository 和 Alembic 基线。
- Runtime、Agent、Skill、Binding、Session、Task、Run、Step、Message、Context、Tool、Permission、Idempotency 和 Event Outbox 表结构。
- Skill Package 文件系统与数据库索引的存储边界。
- 带类型前缀的公共 ID、时间、JSON 和 Revision 规则。
- Agent P0 `/api/v2` 字段级接口、状态码和错误码。
- Normalized Runtime Event 与 Runtime Adapter 内部协议。
- Tool Bridge、Task Dispatcher、Worker Lease、Heartbeat 和重启恢复。
- Task 正常执行、等待权限、等待输入、取消、重试和服务重启时序。
- Agent P0 实施顺序、测试要求和验收标准。

### 1.11 Asset、Artifact、Version、Reference 与 Provenance

[`studio-v2-asset-artifact-version-reference-and-provenance-design.md`](./studio-v2-asset-artifact-version-reference-and-provenance-design.md)

用于确定：

- Blob、Asset、AssetVersion、Artifact 和 ArtifactVersion 的职责边界。
- 内容寻址 Blob Store、SHA-256 去重、Preview Derivative 和物理存储生命周期。
- Asset 与 Artifact 不可变版本、Current Version、Restore 和 Revision 规则。
- Pinned Reference 与 Current Reference，以及任务执行前的版本固定规则。
- Asset、Version、Derivative、Annotation、Tag、Collection、Artifact Type、Artifact、Resource Link、Provenance 和 Application 表结构。
- Asset Ingest、逻辑去重、多结果生成、版本创建和衍生资源规则。
- Agent Structured Output 创建 Artifact、Schema Validation、Review、Diff、Apply 和 Revert。
- GenerationJob 输出创建 Asset 与 Provenance 的标准流程。
- 删除、Trash、Purge、Hard Reference 和 Blob GC。
- Legacy Asset Library、本地素材、共享目录和 Existing Output 的显式导入边界。
- Asset / Artifact / Link / Provenance API、DTO、事件、前端模块与实施顺序。

---

## 2. 当前已确定的核心决策

1. Studio V2 是独立 Greenfield 前端，不以旧前端代码迁移为建设路径。
2. 旧前端和 Studio V2 在过渡期独立运行。
3. 保留 Python + FastAPI 后端，现有 `/api/*` 保持兼容。
4. 新能力通过 `/api/v2/*`、`/ws/v2/*` 和内部 Adapter 增量提供。
5. Studio V2 不隐式双写 Legacy 数据；Legacy 导入是可选兼容能力。
6. 新前端使用 React + TypeScript + Vite，生产流程画布使用 `@xyflow/react`。
7. 页面采用稳定的 App Shell：Navigation + Main Workspace + Inspector + Task Shelf。
8. UI primitives 使用 Base UI，组件源码基座使用 shadcn/ui Base UI 版本。
9. 高频微交互使用 CSS Transition 和 Base UI 状态；复杂可中断动效使用 Motion for React。
10. React Flow 节点位置更新不套 Motion Layout，UI 动效不得牺牲画布性能。
11. React Flow 只注册一个稳定的 `studio-node` Host，业务节点通过 Node Registry 扩展。
12. 顶层 Node Kind 描述业务能力，不使用 Midjourney、RunningHub、ComfyUI 等供应商名称。
13. 节点配置、布局、领域引用、运行任务和临时 UI 状态严格分离。
14. 可撤销编辑统一通过 Command System；Canvas Undo 不撤销已提交的外部任务。
15. 图片、视频、ComfyUI 和供应商任务统一为 GenerationJob。
16. 画布保存由全量快照演进为 Operation + Snapshot。
17. Agent Runtime 复用 Claude CLI、Codex CLI、Gemini CLI、Pi、oh-my-pi 和 ACP 等实现。
18. Infinite-Canvas 实现 Agent Control Plane，不实现新的 Agent Harness。
19. Agent 是执行者配置，Skill 是版本化能力定义，两者独立管理和多对多绑定。
20. 所有 Agent 执行必须 Task / Run 化，并固定 Agent Revision、Skill Version 和 Context Snapshot。
21. 所有副作用操作必须经过 Tool Gateway 或明确 Runtime 权限策略。
22. 结构化 Agent 输出优先 Artifact 化，再由用户确认写回项目领域对象。
23. Agent P0 运行状态使用 SQLite 持久化，不使用零散 JSON 文件作为权威状态。
24. Skill Package 原始内容保存在文件系统，数据库保存身份、来源、版本、Checksum、验证结果和绑定。
25. Agent 状态变化与 Studio Event Outbox 在同一事务提交。
26. Run 使用 Lease 与 Heartbeat，服务重启后可识别并恢复或标记 Interrupted。
27. Runtime Capability 必须真实探测，不支持的能力必须明确降级。
28. Task、Tool Call 和其他副作用请求必须具备幂等边界。
29. Blob 是不可变物理内容；Asset 是可复用媒体身份；Artifact 是可审阅结构化成果。
30. AssetVersion 和 ArtifactVersion 创建后不可原地修改。
31. 任务、Agent Context、GenerationJob 和历史记录必须固定具体 Version，不允许执行期间跟随 Current Version。
32. Blob 按 SHA-256 物理去重，但不同 Project 的逻辑 Asset 不自动合并。
33. 一次生成的多个候选结果创建多个 Asset，不创建一个 Asset 的多个 Version。
34. Asset 与 Artifact 的跨领域关系统一通过 Resource Link 表达。
35. Agent 和 Generation 输出必须记录 Provenance，包括输入 Version、Runtime、Skill、模型、参数和 Context。
36. Agent 批量写入默认先产生 Artifact Preview，再通过 Diff 和 Apply 写入领域对象。
37. Trash 不破坏历史引用；Purge 必须通过 Hard Reference 检查；Blob 仅在零引用且超过保留期后 GC。
38. Studio V2 新 Asset 不自动回写 `asset_library.json`，Legacy 资源通过显式 Ingest 导入。
39. 实时事件统一使用 `/ws/v2/events`，支持 Sequence、Outbox 和断线补拉。
40. `/api/v2` 使用 Pydantic Response Model 和稳定 OpenAPI，不使用裸顶层 `dict`。

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
| Agent / Skill P0 Contract 与 SQLite | 已完成 v1.0 |
| Asset / Artifact / Version / Provenance | 已完成 v1.0 |
| GenerationJob 状态机 | 节点和资源绑定已定义，完整状态机和 Adapter 待设计 |
| Event Hub 详细协议 | P0 已定义，Outbox 表已确定，Publisher 与聚合细节待设计 |
| AI 影视创作领域对象 | 总体模型已定义，字段与流程待细化 |
| 首批内置 Skill | 名单已定义，Manifest、Schema 和测试待设计 |
| Legacy Canvas 可选导入 | 节点级映射已定义，导入报告和回滚后续设计 |
| 实施任务和里程碑 | 待设计 |

---

## 4. 后续详细设计顺序

按当前产品依赖继续：

1. GenerationJob 状态机、Attempt、Executor、Input Snapshot、Output Writer 和供应商 Adapter。
2. Studio Event Outbox Publisher、持久化、聚合、限流和重连实现细节。
3. Project Bible、Script、Character、Scene、Shot 和 Storyboard 详细领域设计与 Tool Contract。
4. Agent Center、Agent Dock、Permission Card、Asset Inspector 和 Artifact Preview 可交互原型。
5. 首批内置 Skill 的 Manifest、Schema、Prompt、测试与质量规则。
6. 分阶段实施任务、依赖关系、验收标准和开发里程碑。
7. Legacy Asset / Canvas 可选导入、迁移报告和失败回滚。

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
- Agent 数据表修改时必须通过 Migration，不得在启动代码中静默重建数据库。
- Skill Manifest 修改时必须同步版本规则、Validator 和测试样例。
- Asset、Artifact、Version、Resource Link 或 Provenance Contract 修改时，必须同步 Context、GenerationJob、Canvas Binding 和删除影响分析。
- Artifact Type Schema 修改时必须增加 Schema Version 和迁移规则，不能原地覆盖历史 Schema。
- Blob Store 修改时必须提供校验、迁移、回滚和 GC 安全策略。
- Node Definition 修改时，必须同步 Definition Version、迁移函数、Inspector、Port 和测试。
- 新增 Provider 或 Executor 时，优先扩展 Adapter，不得默认增加新的顶层 Node Kind。
- Design Token 和 Motion Token 修改时，必须同步组件 Story 和视觉回归用例。
- Legacy API 进入废弃状态时，记录替代接口和迁移期限。
- 供应商专用字段不得直接扩散到 Studio V2 公共 DTO。
- UI 评审意见必须说明可用性、连续性、可访问性或性能原因，不能只用“更高级”“更好看”作为结论。