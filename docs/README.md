# Infinite-Canvas 设计文档索引

> 日期：2026-08-05  
> 当前主题：Studio V2 Greenfield 前端、Agent/Skill 平台、资源版本体系、统一生成任务、可靠事件总线与 AI 影视创作领域设计

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
- Legacy Asset / Canvas 导入是可选兼容专题，不阻塞 Studio V2 主流程。

> 当其他文档中的“渐进迁移”“新旧并行”或“Legacy Adapter”描述与本 ADR 存在歧义时，以本 ADR 为准。

### 1.2 前端总体方向

[`studio-v2-frontend-architecture-overall-design.md`](./studio-v2-frontend-architecture-overall-design.md)

用于确定：

- React + TypeScript + Vite + React Flow 技术路线。
- Studio V2 工作区总体结构。
- 前端状态管理和性能原则。
- Agent Runtime 外置复用边界。
- 为什么不继续扩展原生 `canvas.js`。

> “渐进迁移”只表示功能分阶段建设和用户逐步切换，不表示逐段重写旧前端。  
> UI primitives 最终选型以 1.6 专项文档为准。

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
- Agent Artifact 回写和生成任务等核心流程。
- 第一阶段实际需要建设的页面范围。

### 1.6 UI、交互与动效设计系统

[`studio-v2-ui-interaction-and-motion-design-system.md`](./studio-v2-ui-interaction-and-motion-design-system.md)

用于确定：

- 简洁、克制、专业、即时响应的视觉方向。
- Tailwind CSS + shadcn/ui Base UI + Base UI primitives + Motion for React 最终选型。
- Color、Typography、Spacing、Radius、Elevation 和 Motion Token。
- Button、Popover、Dialog、Sheet、Inspector、NodeCard、Asset Preview 和 Agent UI。
- React Flow 与动效库之间的性能边界。
- Reduced Motion、High Contrast 和 UI 验收规则。

### 1.7 `/api/v2` P0 Contract 与 OpenAPI

[`studio-v2-api-v2-p0-contract-and-openapi-design.md`](./studio-v2-api-v2-p0-contract-and-openapi-design.md)

用于确定：

- Pydantic、OpenAPI、TypeScript 和 Zod 的 Schema 来源关系。
- HTTP Header、Status、Problem Detail、Cursor Pagination 和幂等规则。
- Bootstrap、Runtime Capability、Project、Canvas 和 Asset 的 P0 DTO。
- Canvas Operation、Snapshot 和 Revision 冲突处理。
- GenerationJob 与 Event 的早期 P0 Contract。

> GenerationJob 完整设计以 1.12 为准；Event Hub 完整设计以 1.13 为准。

### 1.8 React Flow 节点模型与 Node Registry

[`studio-v2-react-flow-node-model-and-registry-design.md`](./studio-v2-react-flow-node-model-and-registry-design.md)

用于确定：

- StudioCanvasDocument、StudioCanvasNode 和 StudioCanvasEdge。
- 单一稳定 `studio-node` Host 和 Node Registry 扩展机制。
- Node Kind、Definition Version、Config、Bindings 和 Presentation 分层。
- 强类型 Port、Handle、连接兼容矩阵和 Cycle Policy。
- Asset、Prompt、Batch、Image/Video Generation、Workflow、Agent Task、Shot、Artifact、Output 和 Group 节点。
- Inspector、Command System、Undo/Redo、Clipboard、Grouping 和性能边界。
- GenerationJob、Stale Result 和 Legacy Node 降级绑定。

### 1.9 Agent、Skill、Runtime 与管理系统

[`studio-v2-agent-skill-runtime-and-management-design.md`](./studio-v2-agent-skill-runtime-and-management-design.md)

用于确定：

- Agent Runtime、Runtime Profile、Agent Profile、Skill、Session、Task、Run 和 Step 的领域边界。
- Agent 与 Skill 的多对多绑定和 Skill Version 固定规则。
- Skill Package、`skill.yaml`、`SKILL.md`、Schema、执行模式和来源管理。
- ACP、CLI JSONL、CLI stdio、HTTP Runtime Adapter。
- Context Builder、Tool Gateway、Permission 和 Artifact 输出。
- Agent Center、Agent Dock、Tasks 和 Permissions 页面设计。

### 1.10 Agent / Skill P0 Contract、SQLite 与 Runtime Adapter

[`studio-v2-agent-skill-p0-contract-and-sqlite-design.md`](./studio-v2-agent-skill-p0-contract-and-sqlite-design.md)

用于确定：

- `data/studio-v2/studio.db`、WAL、短事务、Repository 和 Alembic 基线。
- Runtime、Agent、Skill、Session、Task、Run、Context、Tool、Permission、Idempotency 和 Event Outbox 表结构。
- Skill Package 文件系统与数据库索引的存储边界。
- Agent P0 DTO、API、错误码和 Runtime Adapter 内部协议。
- Tool Bridge、Task Dispatcher、Lease、Heartbeat 和重启恢复。
- 等待权限、等待输入、取消和重试时序。

### 1.11 Asset、Artifact、Version、Reference 与 Provenance

[`studio-v2-asset-artifact-version-reference-and-provenance-design.md`](./studio-v2-asset-artifact-version-reference-and-provenance-design.md)

用于确定：

- Blob、Asset、AssetVersion、Artifact 和 ArtifactVersion 的职责边界。
- 内容寻址 Blob Store、SHA-256 去重、Preview Derivative 和物理存储生命周期。
- 不可变 Version、Current Version、Pinned Reference 和 Restore。
- Asset、Artifact、Resource Link、Provenance 和 Application 表结构。
- Agent Structured Output 的 Schema Validation、Review、Diff、Apply 和 Revert。
- GenerationJob 输出创建 Asset 与 Provenance 的标准流程。
- Trash、Purge、Hard Reference 和 Blob GC。
- Legacy Asset Library、本地素材和共享目录的显式导入边界。

### 1.12 GenerationJob 状态机、Executor 与供应商 Adapter

[`studio-v2-generation-job-state-machine-executor-and-adapter-design.md`](./studio-v2-generation-job-state-machine-executor-and-adapter-design.md)

用于确定：

- GenerationJob、GenerationAttempt、Executor、Provider Task、Input Snapshot 和 GenerationOutput。
- Job / Attempt 状态机、Stage、部分成功、Interrupted 和 Abandoned。
- Execution Policy、Pinned / Auto、Fallback、优先级、成本和超时策略。
- Executor Registry、Capability、Limit、Health 和匹配规则。
- 同步 HTTP、异步轮询、CLI、ComfyUI、RunningHub、即梦、Midjourney、Codex Image Skill 和 Legacy Function Adapter。
- Queue、Project 公平调度、Lease、Heartbeat、Backpressure 和重启恢复。
- Cancel、Retry、Late Result、Output Writer、Provenance 和 Canvas Node Binding。

### 1.13 Event Hub、Outbox、Replay 与实时通信

[`studio-v2-event-hub-outbox-replay-and-realtime-design.md`](./studio-v2-event-hub-outbox-replay-and-realtime-design.md)

用于确定：

- Durable Event、Transient Frame 和 Control Frame 的职责边界。
- `studio_event_outbox` 同时作为事务 Outbox、P0 Event Store 和 Replay Source。
- 全局 Sequence、Event ID、Correlation、Causation、Actor 和 Payload Reference。
- Event Schema Registry、命名规则和版本兼容。
- EventOutboxPublisher、批量 Claim、Lease、Retry 和 Dead Letter。
- `/ws/v2/events`、Catch-up Buffer、Heartbeat、Checkpoint、Ack 和动态订阅。
- `/api/v2/events` Replay、Project / Aggregate Filter、Replay Gap 和 Sequence Ahead。
- Event Sync Snapshot 和客户端全量状态恢复。
- 每连接独立 Queue、慢消费者、Transient 丢弃和 Durable Event 不静默丢失。
- Agent Message Delta、Generation Progress、Plan 和 Asset Ingest 的限流与合并。
- Event Retention、Progress Compaction、Replay Floor 和前端 Event Client。

---

## 2. 当前已确定的核心决策

### 2.1 架构与前端

1. Studio V2 是独立 Greenfield 前端，旧前端和新前端独立运行。
2. 保留 Python + FastAPI，现有 `/api/*` 保持兼容；新能力通过 `/api/v2/*` 和 `/ws/v2/*` 提供。
3. 新前端使用 React + TypeScript + Vite，生产流程画布使用 `@xyflow/react`。
4. React Flow 只注册稳定 `studio-node` Host，业务节点通过 Node Registry 扩展。
5. 节点配置、布局、领域引用、任务状态和临时 UI 状态严格分离。
6. UI 使用 shadcn/ui Base UI、Base UI primitives、Tailwind CSS 和 Motion for React；动效不得牺牲画布性能。

### 2.2 Agent 与 Skill

7. Infinite-Canvas 实现 Agent Control Plane，不重新实现 Agent Harness。
8. Agent 是执行者配置，Skill 是版本化能力包，两者独立管理和多对多绑定。
9. 所有 Agent 执行必须 Task / Run 化，并固定 Agent Revision、Skill Version 和 Context Snapshot。
10. 所有副作用必须经过 Tool Gateway 或明确 Runtime 权限策略。
11. 结构化 Agent 输出优先 Artifact 化，再通过 Review、Diff 和 Apply 写入领域对象。
12. Agent 状态使用 SQLite；Skill 原始包保存在文件系统，数据库保存版本、Checksum、验证结果和绑定。
13. Runtime Capability 必须真实探测，不支持 Tool Calling、Permission 或 Resume 时明确降级。

### 2.3 Asset、Artifact 与生成任务

14. Blob 是不可变物理内容；Asset 是可复用媒体身份；Artifact 是可审阅结构化成果。
15. AssetVersion 和 ArtifactVersion 创建后不可原地修改。
16. 任务、Agent Context、GenerationJob 和历史记录必须固定具体 Version。
17. Blob 按 SHA-256 物理去重，但不同 Project 的逻辑 Asset 不自动合并。
18. 一次生成的多个候选结果创建多个 Asset，不创建一个 Asset 的多个 Version。
19. Asset 与 Artifact 的跨领域关系统一通过 Resource Link 表达，输出必须记录 Provenance。
20. Trash 不破坏历史引用；Purge 必须检查 Hard Reference；Blob 仅在零引用并超过保留期后 GC。
21. GenerationJob 表达稳定用户意图；每次真实执行创建独立 Attempt。
22. Provider Task ID、供应商状态和专用参数只属于 Attempt / Adapter。
23. Input Snapshot 在 Job 创建时固定，运行中不读取 Current Asset、当前节点配置或可变 Workflow。
24. Retry、Fallback 和修改输入后的重新生成必须区分；输入语义变化时创建新 Job。
25. 多输出任务允许部分成功；取消后迟到结果默认归档或保持未绑定。
26. 所有生成结果必须经过 Output Writer 才能创建 Blob、Asset、Preview、Provenance 和 Node Binding。

### 2.4 Event Hub

27. 业务状态是权威事实，Event 是通知和同步机制。
28. 状态变化与 Durable Event Outbox 必须在同一 SQLite 事务提交。
29. Durable Event 使用 At-Least-Once，前端必须按 Event ID 和 Sequence 去重。
30. 全局 Sequence 是排序游标，不要求连续；Filter 和 Compaction 可以产生跳号。
31. Agent Token 和细粒度进度走 Transient Lane；最终 Message、状态和终态走 Durable Lane。
32. Replay 与实时切换使用 Catch-up Buffer，不能在建连窗口漏事件。
33. Project 和权限过滤必须在服务端完成。
34. 慢消费者优先丢弃 Transient Frame；Durable Queue 超限时断开并要求 Replay，不静默丢弃。
35. Event Hub 支持 Replay Gap、Sequence Ahead、Sync Snapshot、Retention 和 Progress Compaction。
36. 旧 `/ws/stats` 保持不变，不作为 Studio V2 Event Hub 的实现基类。

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
| GenerationJob 状态机、Executor 与 Adapter | 已完成 v1.0 |
| Event Hub、Outbox、Replay 与实时通信 | 已完成 v1.0 |
| AI 影视创作领域对象 | 总体模型已定义，字段、版本和流程待细化 |
| Agent Tool `generation.submit` 与预算权限 | 待设计 |
| Agent Center 与创作工作区交互原型 | 待设计 |
| 首批内置 Skill | 名单已定义，Manifest、Schema 和测试待设计 |
| Legacy Asset / Canvas 可选导入 | 节点级映射已定义，导入报告和回滚后续设计 |
| 实施任务和里程碑 | 待设计 |

---

## 4. 后续详细设计顺序

按当前产品依赖继续：

1. Project Bible、Script、Character、Scene、Prop、Shot、Storyboard 和 Continuity 详细领域设计与 Tool Contract。
2. Agent Tool `generation.submit`、预算、付费权限和 AgentTask / GenerationJob 联动。
3. Agent Center、Agent Dock、Permission Card、Asset Inspector、Artifact Preview、Task Shelf 和 Job Detail 可交互原型。
4. 首批内置 Skill 的 Manifest、Schema、Prompt、测试与质量规则。
5. 分阶段实施任务、模块依赖、验收标准和开发里程碑。
6. Legacy Asset / Canvas 可选导入、迁移报告和失败回滚。

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
- 旧 `/api/*` 或 `/ws/stats` 修改时必须进行兼容性评估。
- `/api/v2` Contract 修改时，必须同步 OpenAPI、前端 TypeScript 类型、关键 Zod Schema 和设计文档。
- Agent Profile、Skill、Runtime、Tool 或 Permission Contract 修改时，必须同步管理 UI、事件和审计用例。
- Agent、Generation 和 Event 表修改必须通过 Alembic Migration，不得在启动代码中静默重建数据库。
- Skill Manifest 修改时必须同步版本规则、Validator 和测试样例。
- Asset、Artifact、Version、Resource Link 或 Provenance 修改时，必须同步 Context、GenerationJob、Canvas Binding 和删除影响分析。
- Artifact Type Schema 修改时必须增加 Schema Version 和迁移规则，不能原地覆盖历史 Schema。
- Blob Store 修改时必须提供校验、迁移、回滚和 GC 安全策略。
- GenerationJob Status、Attempt Status、Executor、Fallback 或 Cancel 规则修改时，必须同步 Adapter Contract、事件、Task Shelf、恢复测试和 OpenAPI。
- Event Type 或 Payload 修改时，必须同步 Event Schema Version、后端 Registry、前端 Zod、Replay 测试和 Retention 规则。
- Durable Event 不得被 Transient 优化规则静默降级；终态事件不得被合并或丢弃。
- 新增 Provider、Model、Workflow 或 Runtime 时，优先注册 Executor 和 Adapter，不得默认增加新的顶层 Node Kind 或公共 Job Kind。
- Node Definition 修改时，必须同步 Definition Version、迁移函数、Inspector、Port 和测试。
- Design Token 和 Motion Token 修改时，必须同步组件 Story 和视觉回归用例。
- Legacy API 进入废弃状态时，记录替代接口和迁移期限。
- 供应商专用字段不得直接扩散到 Studio V2 公共 DTO 或 Event Payload。
- UI 评审意见必须说明可用性、连续性、可访问性或性能原因，不能只用“更高级”“更好看”作为结论。
