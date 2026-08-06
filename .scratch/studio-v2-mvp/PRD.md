# Studio V2 个人版 MVP（第一版）PRD

Status: ready-for-agent
Type: PRD
Feature: studio-v2-mvp
日期: 2026-08-05
适用仓库: twj515895394/Infinite-Canvas

---

## 问题陈述

当前 Infinite-Canvas 前端由原生 HTML/CSS/JS 构成，核心画布（canvas.js）、任务、素材、模型配置和交互逻辑高度耦合，难以继续演进。用户需要一个由全新 React UI 驱动的个人 AI 创作画布：继续使用现有核心生成与画布能力，提供更好用的资产管理，并支持管理 Agent、安装 Skill、选择资产上下文和执行任务。旧前端作为过渡期回退入口保留。

## 解决方案

建设独立的 Studio V2 前端工程（React + TypeScript + Vite + React Flow），现有 FastAPI 后端 `/api/*` 保持兼容直接复用，新增少量 `/api/v2/*` 领域接口。第一版围绕四条主线交付：

1. 新 React UI 与 React Flow 画布（App Shell、项目/画布闭环）。
2. 核心现有功能接入（图片/视频生成、ComfyUI、即梦、Codex Skill、上传/媒体、Provider/存储设置、Task Shelf、旧版回退）。
3. 新资产库（Asset/AssetVersion/Tag/Collection，上传、导入、搜索、回收站、画布拖放、Agent 上下文）。
4. Agent / Skill 管理与真实执行闭环（Runtime Probe、Agent CRUD、Skill 安装绑定、Agent Dock 任务执行、Artifact/资产保存）。

## 用户故事

### A. UI 与画布闭环

1. 作为创作者，我想要打开全新的 Studio V2 UI，以便不再依赖旧前端作为主入口。
2. 作为创作者，我想要使用统一的 App Shell（左侧主导航、顶部项目上下文、主工作区、右侧 Inspector、底部/浮动 Task Shelf、全局 Toast/Dialog/Command Menu），以便在一致的界面中完成创作。
3. 作为创作者，我想要创建、打开、重命名、删除或归档项目，以便管理多个创作项目。
4. 作为创作者，我想要查看最近项目列表，以便快速回到上次的工作。
5. 作为创作者，我想要在生成画布中创建、删除、移动、复制节点，以便组织生成工作流。
6. 作为创作者，我想要创建和删除节点连线，以便定义节点间的数据流。
7. 作为创作者，我想要缩放、平移和框选画布，以便在大型画布中导航。
8. 作为创作者，我想要在 Inspector 中编辑节点参数，以便配置生成任务。
9. 作为创作者，我想要保存画布并在重新打开后内容一致，以便不丢失工作。
10. 作为创作者，我想要使用 Undo/Redo 撤销或重做本地编辑，以便纠正误操作。
11. 作为创作者，我想要将资产拖入画布生成节点，以便引用素材。
12. 作为创作者，我想要把生成输出保存到资产库，以便复用和归档结果。
13. 作为创作者，我想要并发编辑冲突时得到 revision 冲突提示并重新加载，以便个人使用场景下避免覆盖丢失。
14. 作为创作者，我想要深链接可以恢复项目与工作区，以便分享和恢复工作上下文。

### B. 核心旧功能接入

15. 作为创作者，我想要执行通用图片生成（提交参数、显示等待状态、展示结果、失败可重试），以便不回到旧 UI 完成主要生成流程。
16. 作为创作者，我想要执行视频生成的主要路径，以便保留当前可用的视频生成能力。
17. 作为创作者，我想要在 Workflow 节点中选择 ComfyUI 工作流、配置参数、运行并获取输出，以便继续使用 ComfyUI。
18. 作为创作者，我想要在图片或视频节点中选择即梦作为 Provider 并执行，以便保留即梦主要生成入口。
19. 作为创作者，我想要执行 Codex / GPT Image 2 Skill 生图，以便使用现有 CLI helper 能力并将结果加入资产库。
20. 作为创作者，我想要上传文件并预览常见图片和视频，以便把素材带入创作。
21. 作为创作者，我想要在设置页新增、修改、启停和测试 Provider，以便管理生成服务配置。
22. 作为创作者，我想要查看和修改存储目录设置，以便控制上传、生成和本地目录。
23. 作为创作者，我想要在 Task Shelf 查看任务的运行、成功和失败状态，以便跟踪生成进度。
24. 作为创作者，我想要从设置页或用户菜单返回旧版前端，以便新 UI 未覆盖问题时回退。

### C. 资产库

25. 作为创作者，我想要以 Grid 和 List 方式浏览图片和视频资产，以便快速查找素材。
26. 作为创作者，我想要上传文件、导入本地目录文件、导入远程 URL，以便资产统一入库。
27. 作为创作者，我想要给资产打标签、放入 Collection、按名称/描述/标签搜索并按类型筛选，以便组织素材。
28. 作为创作者，我想要重命名资产、编辑描述，以便管理元数据。
29. 作为创作者，我想要删除资产到回收站并可恢复，以便误删后找回。
30. 作为创作者，我想要查看资产的基础版本列表，以便追溯历史版本。
31. 作为创作者，我想要将生成结果自动创建为 Asset，以便生成与资产库打通。
32. 作为创作者，我想要将资产拖入画布并让节点引用明确的 AssetVersion，以便引用可追溯。
33. 作为创作者，我想要在 Agent 任务中选择 AssetVersion 作为上下文，以便让 Agent 基于素材工作。

### D. Agent / Skill 闭环

34. 作为创作者，我想要新建和编辑 Runtime Profile、配置可执行文件或 Endpoint 并执行 Probe，以便确认 Runtime 可用。
35. 作为创作者，我想要启用、禁用 Runtime 并查看最近错误，以便管理执行环境。
36. 作为创作者，我想要创建、编辑、复制、启停 Agent 并绑定 Runtime 和模型，以便定义执行者。
37. 作为创作者，我想要扫描内置 Skill 目录、从本地目录或 ZIP 导入 Skill、查看版本和校验错误，以便扩充能力。
38. 作为创作者，我想要启用/禁用 Skill 并将 Skill 绑定到 Agent，以便配置 Agent 能力。
39. 作为创作者，我想要对 Agent 执行测试运行，以便验证配置正确。
40. 作为创作者，我想要打开 Agent Dock，选择 Agent 和 Skill、输入任务、添加资产上下文或当前画布选中节点上下文，以便提交真实任务。
41. 作为创作者，我想要启动任务并查看流式或阶段性输出，以便观察执行过程。
42. 作为创作者，我想要取消运行中的任务，以便及时止损。
43. 作为创作者，我想要查看任务最终结果，并将结果保存为文本/JSON Artifact 或导入资产库，以便留存成果。
44. 作为创作者，我想要在资产库选中一张或多张素材后通过"使用 Agent"发起任务（如分析图片、生成描述、参考图生成提示词、角色一致性检查），以便直接在素材上工作。
45. 作为创作者，我想要在画布中使用基础 agent-task 节点（选择 Agent/Skill、输入端口、输出文本或 Artifact），以便将 Agent 编入工作流。
46. 作为创作者，我想要任务失败时看到可理解的错误信息，以便定位问题。
47. 作为创作者，我想要重启应用后任务历史仍然保留，以便追溯。

### E. 设置与系统

48. 作为创作者，我想要设置页包含 Provider 配置、存储目录、Runtime 配置与探测、基础外观设置和旧版入口，以便一站式管理。
49. 作为创作者，我想要所有主要页面具备加载、错误、空状态，以便界面反馈完整。
50. 作为创作者，我想要关键操作（修改画布/项目、提交可能付费的生成、执行外部命令、删除）在执行前确认，以便避免误操作。

## 实现决策

### 总体架构（ADR-001）

- Studio V2 为独立 Greenfield 前端，不复用/不迁移旧 `canvas.js`；新旧前端过渡期并行运行。
- 现有 `/api/*` 保持兼容，仅必要修复，不承载新领域模型。
- 新能力通过 `/api/v2/*` 增量提供；后端保留 FastAPI，新增独立 `api/v2` 领域层（routers → services → adapters → repositories），不再堆进 main.py。
- 新领域数据（Asset、Agent、Skill、Task、Canvas V2 元数据、Project）用 SQLite（`data/studio-v2/studio.db`，WAL、外键、Unix Epoch 毫秒、带前缀 UUID），素材文件仍存本地目录；禁止隐式双写。

### 后端模块

- **M1 V2 契约基础设施**：Pydantic Request/Response 为契约唯一事实源；统一 `ApiProblem` 错误模型（application/problem+json，含 code/request_id/retryable/field_errors）；游标分页（PageInfo{next_cursor,has_many,limit,total}，limit 默认 50 最大 200）；写请求带 `X-Client-Id`，长任务创建带 `Idempotency-Key`，乐观锁 `If-Match`/`base_revision`；snake_case、ISO 8601、不透明 ID 前缀（prj_/cnv_/ast_/job_/agt_/skl_/tsk_）。
- **M2 Asset 模块**（深模块）：实体 Asset/AssetVersion/AssetCollection/AssetTag；AssetVersion 创建后不可变，Restore 不删新版本；回收站（Trash 不破坏引用，Purge 前检查 Hard Reference 返回 409 ASSET_IN_USE）；ingest 支持 upload（multipart）/remote_url/local_file/shared_folder 源；搜索至少覆盖名称、描述、标签；接口：`GET/POST /api/v2/assets`、`GET/PATCH/DELETE /api/v2/assets/{id}`、`POST /api/v2/assets/{id}/restore`、`GET/POST /api/v2/assets/{id}/versions`、`/api/v2/asset-collections` CRUD。
- **M3 Agent 模块**（深模块）：Runtime Profile/Probe（推荐 Codex CLI 优先，Generic CLI JSONL/stdio 次之，ACP 后续）、Agent Profile（与 Skill 强制分离）、Skill 管理（skill.yaml + SKILL.md 包，扫描内置目录/本地目录/ZIP 导入、Manifest 校验、Enable/Disable/Test、版本固定）、Agent Task（状态机 queued→running→waiting_input→succeeded/failed/cancel_requested→cancelled，单 Run、Task 历史、幂等创建、可取消、可重试且 Retry 不覆盖历史 Run）、Dispatcher 从 SQLite Claim 任务并调用 Runtime Adapter、Tool Gateway（有副作用 Tool 带 Idempotency Key，Permission 一次性决策）、Context Snapshot（Run 启动时固定，执行前把 AssetVersion 解析为 Pinned Version）；Adapters 必须把输出归一化为统一事件，Service 不解析 stdout 文本；P0 数据表 19 张（agent_runtime_profiles、agent_profiles、skills、skill_installations、agent_skill_bindings、agent_sessions、agent_tasks、agent_runs、agent_steps、agent_messages、context_snapshots、context_references、tool_calls、permission_requests、permission_grants、idempotency_records 等）；接口：`/api/v2/agent-runtimes` CRUD+probe、`/api/v2/agent-profiles` CRUD+test+skills 关联、`/api/v2/skills`（list/discover/import/enable/disable/test）、`/api/v2/agent-tasks`（create/list/get/cancel/events）；Task 实时输出第一版可选 SSE / 简单 WebSocket / 短轮询。
- **M4 Canvas V2 模块**：Project/Canvas CRUD（含归档 restore）、Canvas Operation 增量持久化（node.create/update/position.update/delete、edge.create/update/delete、viewport.update 等，单批 ≤200，`operation_id` 幂等去重，base_revision 冲突返回 409 CANVAS_REVISION_CONFLICT，不做 CRDT）、Snapshot/Checkpoint（PUT snapshot 用于导入/压缩）、LegacyCanvasAdapter 两阶段只读迁移（读取旧画布 JSON 转换，不写回）；接口：`GET/POST /api/v2/projects`、`GET/PATCH/DELETE /api/v2/projects/{id}`、`POST /api/v2/projects/{id}/restore`、`GET/POST /api/v2/projects/{pid}/canvases`、`GET/PATCH /api/v2/canvases/{id}`、`POST /api/v2/canvases/{id}/operations`、`PUT /api/v2/canvases/{id}/snapshot`。
- **M5 GenerationJob 轻量版**：统一任务模型包装现有生成接口（kind=image/video/workflow），状态机 queued→starting→running→waiting_external→succeeded/failed/cancel_requested/cancelled；Job 通过 ID 关联 Canvas 节点不复制节点；接口 `POST /api/v2/generation-jobs`（带 Idempotency-Key）、`GET /api/v2/generation-jobs`、`GET .../{job_id}`、`POST .../{job_id}/cancel|retry`；允许简化：Task Shelf + 轮询，不强制完整 /ws/v2/events。
- **M6 轻量 Adapter/BFF**：`GET /api/v2/bootstrap`（前端初始化所需配置）、`GET /api/v2/runtime-capabilities`（探测结果聚合）；画布、Provider、ComfyUI、生成能力优先直接复用现有接口，不为接口形式统一而阻塞开发。

### 前端模块

- **F1 工程骨架 + App Shell**：独立 `studio-v2/` 工程（React 18+、TypeScript、Vite、React Router、TanStack Query、Zustand、Zod、Tailwind CSS、shadcn/ui Base UI 版、Base UI primitives、Motion for React、Lucide）；四区布局（两级左侧导航 + TopBar + Main + Inspector 340px + 底部 Task Shelf）；P0 组件（App Shell、Button/IconButton、Tooltip、Popover/Menu/ContextMenu、Dialog/Sheet、Tabs、Input/Select/Combobox、Toast、NodeCard、Inspector、Task Shelf、MediaThumbnail、Command Palette、Skeleton/Empty/Error）；完整 Design/Motion Token（语义色、4px 基线、高频动效 ≤180ms、默认 Spring 无 Bounce）；强制 Accessibility（Reduced Motion/对比度/键盘）；动效只改 transform/opacity、禁 transition:all；命令面板、全局 Toast/Dialog；设置页（Provider/Storage/Runtime 探测/Appearance/Legacy 入口）；旧版回退入口；URL 可恢复项目与工作区。
- **F2 React Flow 画布引擎**（深模块）：@xyflow/react 为唯一生产画布引擎，单一稳定 `studio-node` Host（nodeTypes 冻结）；Node Registry 为唯一扩展入口（definition 含 schema/组件/inspector/ports/capabilities/validate/buildExecution/legacyAdapters，启动冻结 + 逐节点 Zod 迁移）；节点类型表达业务能力不表达供应商（midjourney/comfy 等降级为 config.executor/provider_id）；Command System 驱动 Undo/Redo（13 类第一版命令、拖拽手势合并为单命令、Undo 不撤销已提交外部任务）；Zustand Editor Store 七分片（nodes/edges/selection/viewport/history/dirty/runtime）；强类型 Port + 连接验证（9 步校验）；Command → Operation 增量持久化 + revision；自定义 Clipboard 格式；输入快照防上游变更 + Stale 提示；MVP 节点集：Asset/Prompt/Image-Generation/Video-Generation/Workflow/Output/Group/Artifact（Agent-Task 延后）；性能预算 100 节点流畅 / 300 节点可操作 / 拖拽不触发保存 / 视频默认 Poster / 资产虚拟化。
- **F3 核心旧功能接入**：Feature API 层统一封装现有 `/api/*`（供应商字段不扩散到通用组件）；图片生成（提交参数/等待/结果/重试）、视频生成主要路径、ComfyUI（工作流选择/配置/运行/输出）、即梦 Provider 选项、Codex / GPT Image 2 Skill、上传与媒体预览、Provider/存储设置、Task Shelf（轮询状态）。
- **F4 资产库 UI**：Grid/List 浏览、图片/视频预览、上传/本地导入/远程 URL 导入、Tag/Collection、搜索与类型筛选、重命名/描述、回收站与恢复、版本列表、拖入画布（引用 AssetVersion）、Agent 上下文选择。
- **F5 Agent Center + Agent Dock**：Agent Center 四 Tab（Agents/Skills/Runtimes/Tasks）；Agent Dock 从生成画布、资产库、Agent Center 测试页可打开；Dock 流程（选 Agent → 选 Skill → 输入任务 → 添加资产/画布节点上下文 → 启动 → 流式状态 → 取消 → 结果保存为 Artifact/资产）；画布基础 agent-task 节点（不保存完整日志，只保存 Task ID 和最新结果引用）。

### 数据与迁移

- 第一版数据：现有项目/画布/Provider 配置继续用原 JSON/文件目录；新领域元数据进 SQLite；素材文件继续本地目录。
- 不强制内容寻址 Blob Store、SHA-256 物理去重、Blob GC、全量 Legacy 数据迁移。

## 测试决策

- **测试原则**：只测外部行为与可观察契约，不测实现细节；优先深模块。
- **后端核心（M2/M3/M4）**——pytest，跟随 tests/ 现有先例（test_canvas_log_cleanup.py）：
  - M2：ingest（upload/remote/local）建 Asset + AssetVersion；版本创建后不可变；Restore 不删新版本；Trash 后引用仍可解析；Purge 存在 Hard Reference 返回 409；搜索按名称/描述/标签命中。
  - M3：Task 状态机全迁移（queued→running→succeeded/failed/cancelled）；取消与 cancel_requested 转换；Retry 复用原 Task 建新 Run 且不覆盖历史；Idempotency-Key 重复创建返回同一任务；Context Snapshot 固定 Pinned Version；同一副作用 Tool Call 重放不重复执行；重启后历史保留、无法恢复的 Run 标 interrupted。
  - M4：Canvas Operation 增量持久化往返；base_revision 冲突返回 409；operation_id 幂等去重；LegacyCanvasAdapter 读取转换正确且不写回。
- **画布引擎（F2）**——Vitest + Testing Library：
  - Node Registry 注册/冻结/不合法节点拒绝；Command System 13 类命令 Undo/Redo 语义（拖拽合并、Undo 不撤销已提交外部任务）；Port 连接 9 步验证（类型/方向/环/重复）；Persistence 快照往返一致；Clipboard 自定义格式复制粘贴；输入快照 Stale 提示。
- **关键验收链路 E2E**：项目 → 画布编辑 → 保存重开一致 → 图片生成 → 输出入资产库 → 资产拖回画布 → Agent Dock 提交真实任务 → 结果保存 Artifact。每条链路一个代表性用例（正常/边界/异常至少覆盖主路径）。

## 超出范围

- RunningHub、Midjourney 新 UI 接入（旧接口保留，后续统一接入）。
- 独立对话 / Conversation 页面与提示词库 / Prompt Library 管理（可在节点/Skill 中直接输入 Prompt）。
- 完整 GenerationJob（Attempt/Fallback/Executor Registry）、完整 Event Hub（Outbox/Replay/慢消费者）、内容寻址 Blob Store 与 GC、完整 Provenance 图谱、Artifact Version/Diff/Apply/Revert。
- 影视专业领域模型（Project Bible、Script、Character/Scene/Shot/Storyboard/Continuity）——仅留路由位。
- 复杂 Agent Permission Grant、多 Runtime Session Resume、多 Agent 编排、Skill Marketplace、Git 自动更新、任意脚本无隔离执行。
- 企业级认证、用户、项目权限、多租户；更新/备份/回滚新 UI（旧页面继续承担）。

## 进一步说明

### 索引的设计文档（按决策优先级：MVP 基线 > ADR > 专项设计 > 总体设计 > 现有实现）

| 优先级 | 文档 |
|---|---|
| 1（范围基线） | `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md` |
| 2（架构约束） | `docs/adr-001-studio-v2-greenfield-frontend-and-additive-backend.md` |
| 3（前端） | `docs/studio-v2-frontend-architecture-overall-design.md`、`docs/studio-v2-information-architecture-and-core-workflows.md`、`docs/studio-v2-ui-interaction-and-motion-design-system.md`、`docs/studio-v2-react-flow-node-model-and-registry-design.md` |
| 3（后端） | `docs/current-backend-api-capability-inventory.md`、`docs/studio-v2-api-v2-p0-contract-and-openapi-design.md`、`docs/studio-v2-backend-api-gap-and-v2-design.md` |
| 3（Agent/资产） | `docs/studio-v2-agent-skill-runtime-and-management-design.md`、`docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md`、`docs/studio-v2-asset-artifact-version-reference-and-provenance-design.md` |
| 导航 | `docs/README.md` |

### 开发阶段（5 阶段，前后端可并行项以任务拆分时标注）

1. 新 UI 工程骨架 + 项目/画布闭环（F1+F2 基础 + M4 + M1）。
2. 核心旧功能逐项接入（F3 + M5 + 复用现有 /api/*）。
3. 新资产库（F4 + M2）。
4. Agent / Skill 闭环（F5 + M3）。
5. 稳定性、测试、旧版回退与第一版发布。

### 第一版验收标准（完整清单见 MVP 基线文档 §14，关键项）

- UI：所有 MVP 主页面使用新 React UI，旧前端不是默认入口；加载/错误/空状态完整。
- 功能保留：项目/画布 CRUD、画布保存重开一致、图片/视频生成、ComfyUI、即梦、Codex Skill、上传预览下载、Provider/存储设置全部可用。
- 资产库：上传/导入/生成结果可创建 Asset；预览、搜索、标签、Collection、版本列表可用；可拖入画布、可作为 Agent 上下文；删除进回收站可恢复。
- Agent/Skill：至少一个 Runtime Probe 成功；Agent 可创建编辑；Skill 可发现/导入/启用禁用/绑定；Agent Dock 可提交真实 Task；可读资产/画布上下文；可看状态和结果；可取消；结果可存 Artifact/Asset；失败显示可理解错误。
- 明确延后项（RunningHub、Midjourney、对话、提示词库）标记为后续，不影响验收。

### 演进备注

- 第一版不应被完整 GenerationJob / Event Hub / Blob Store / Provenance / 影视领域模型 / 多租户等阻塞。
- 实施时可以保留兼容接口和扩展点，但不得为了未来完整性延迟个人版可用闭环。
