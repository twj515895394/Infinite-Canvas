# Infinite-Canvas Studio V2 后端 API 能力差距与 V2 接口总体设计

> 文档状态：总体设计基线（To-Be Baseline）  
> 版本：v1.0  
> 日期：2026-08-05  
> 适用仓库：`twj515895394/Infinite-Canvas`  
> 前置文档：  
> - `docs/studio-v2-frontend-architecture-overall-design.md`  
> - `docs/current-backend-api-capability-inventory.md`

---

## 1. 文档目的

本文档基于现有 FastAPI API 能力，确定 Studio V2 新前端还需要后端补充哪些领域能力、接口、事件和兼容层。

本设计遵循一个核心前提：

> 不整体重写后端，不替换 FastAPI，不重新实现已经存在的文件、生成、ComfyUI 和供应商适配能力。

新增工作主要是：

1. 在现有后端之上增加稳定的 `/api/v2` Contract。
2. 把分散的生成接口包装成统一 Job 模型。
3. 增加 Studio V2 所需的项目、剧本、角色、场景、镜头、分镜、资产版本和 Artifact 领域模型。
4. 增加增量画布保存和统一事件通道。
5. 增加 Agent Gateway API，但不实现新的 Agent Harness。

---

## 2. 总体判断

## 2.1 后端是否需要换架构

不需要。

继续保留：

- Python。
- FastAPI。
- 当前文件目录和媒体代理。
- 当前 Provider 配置。
- 当前 ComfyUI、RunningHub、即梦、Midjourney、ModelScope 等调用实现。
- 当前工作流文件和配置。
- 当前 Legacy API。

建议新增：

```text
main.py / Legacy Routers
        │
        ├── 原有接口继续运行
        │
        ▼
Studio V2 Routers: /api/v2
        │
        ├── Project Service
        ├── Asset Service
        ├── Canvas Service
        ├── Generation Job Service
        ├── Artifact Service
        ├── Agent Gateway
        └── Event Hub
        │
        ▼
Existing Implementations / Adapters
```

后续可逐步从 `main.py` 拆出模块，但模块拆分不是 Studio V2 前端启动的前置条件。

## 2.2 为什么必须增加 v2 API

现有 API 能力很多，但直接用于 Studio V2 会遇到：

- 前端需要理解不同供应商协议。
- 任务状态和错误格式不统一。
- 画布只能整份保存。
- 资产库一次返回完整 JSON。
- 项目没有剧本、角色、场景和镜头领域对象。
- WebSocket 事件不可恢复。
- Agent 只有简单聊天，没有 Session、Task、Tool Call 和 Artifact。

因此 `/api/v2` 的作用不是重复实现，而是建立一个稳定的 Studio 领域边界。

---

## 3. 设计原则

## 3.1 Legacy 与 V2 并行

```text
/api/*       → 现有页面与兼容调用
/api/v2/*    → Studio V2
/ws/stats    → Legacy 广播
/ws/v2/events → Studio V2 统一事件
```

在 Studio V2 完成迁移前，不删除原有 API。

## 3.2 新前端不感知供应商协议

前端只提交统一任务：

```text
image
video
audio
workflow
agent
export
```

后端 Adapter 决定实际使用：

- OpenAI compatible。
- RunningHub。
- ComfyUI。
- 即梦。
- Midjourney。
- ModelScope。
- 其他 Provider。

## 3.3 长任务全部 Job 化

任何预计不能立即完成的操作都返回 Job ID：

- 图片生成。
- 视频生成。
- 工作流执行。
- 素材 Caption/分类。
- 批量导入。
- Agent Task。
- 视频导出。

## 3.4 文件、资产和 Artifact 分层

```text
StorageObject
    └── 文件物理位置、大小、MIME、Hash

Asset
    └── 可被项目引用的图片/视频/音频/文档实体

AssetVersion
    └── 原图、裁切、增强、重新编码、生成版本

Artifact
    └── 剧本分析、角色设定、镜头表、分镜包、提示词包等结构化成果
```

## 3.5 画布操作与业务数据分离

- 节点坐标和连接属于 Canvas Document。
- 角色、镜头、资产、任务属于领域对象。
- 画布节点保存领域对象 ID，不复制完整业务对象。

## 3.6 事件可恢复

所有 Studio V2 事件必须包含：

- `event_id`
- `sequence`
- `timestamp`
- `project_id`
- `aggregate_type`
- `aggregate_id`
- `type`
- `payload`

断线后可按 `sequence` 补拉。

---

## 4. Studio V2 核心领域对象

## 4.1 Project

项目从“画布分组”升级为创作空间。

建议字段：

```text
id
name
description
status
cover_asset_id
settings
created_at
updated_at
revision
```

## 4.2 ProjectBible

项目统一设定：

```text
project_id
logline
genre
theme
tone
visual_style
world_rules
character_rules
continuity_rules
negative_constraints
model_preferences
revision
```

## 4.3 Script

```text
id
project_id
title
content
format
status
version
metadata
```

## 4.4 Character / Scene / Prop

统一具备：

```text
id
project_id
name
description
structured_profile
reference_asset_ids
status
revision
```

## 4.5 Shot

```text
id
project_id
scene_id
sequence_no
shot_no
duration
shot_size
camera
movement
action
dialogue
visual_prompt
negative_prompt
status
reference_asset_ids
```

## 4.6 StoryboardFrame

```text
id
shot_id
frame_no
asset_id
caption
camera_note
continuity_note
status
```

## 4.7 Asset / AssetVersion

```text
Asset
- id
- project_id
- kind
- name
- current_version_id
- tags
- metadata
- created_at
- updated_at

AssetVersion
- id
- asset_id
- parent_version_id
- storage_url
- preview_url
- mime_type
- width
- height
- duration
- checksum
- source_type
- source_job_id
- created_at
```

## 4.8 Artifact

建议类型：

```text
project-bible
script-document
story-analysis
character-design
scene-design
shot-list
storyboard-package
sound-plan
video-prompt-pack
comfy-generation-plan
agent-report
```

Artifact 保存结构化 JSON、Markdown 或文件引用，并具备版本和来源 Task。

## 4.9 GenerationJob

```text
id
project_id
canvas_id
node_id
kind
executor
provider_id
model
workflow_id
status
progress
inputs
parameters
result_asset_ids
error
created_at
started_at
finished_at
revision
```

## 4.10 AgentProfile / AgentSession / AgentTask

Infinite-Canvas 不实现 Agent Harness，只管理外部 Runtime 的宿主生命周期。

```text
AgentProfile
- id
- name
- runtime_type
- command/adapter
- capabilities
- enabled

AgentSession
- id
- project_id
- profile_id
- runtime_session_id
- status
- workspace
- created_at
- updated_at

AgentTask
- id
- session_id
- skill_id
- status
- input_artifact_ids
- output_artifact_ids
- context
- permission_policy
- created_at
- finished_at
```

---

## 5. 当前 API 与 V2 能力映射

| Studio V2 能力 | 当前基础 | 差距 | V2 处理 |
|---|---|---|---|
| 项目列表和创建 | `/api/projects` | 字段少、无 Bible | 包装并扩展 Project Service |
| 画布读取 | `/api/canvases/{id}` | Legacy JSON | LegacyCanvasAdapter 转换 |
| 画布保存 | `PUT /api/canvases/{id}` | 整体保存 | 增量 Operation + Snapshot |
| 资产读取 | `/api/asset-library`、`/api/storage-files` | 无分页统一模型 | Asset Query API |
| 媒体预览 | `/api/media-preview` | 基本满足 | 直接复用 |
| 上传和导入 | 多个 upload/import API | 入口分散 | Asset Ingest Job |
| 图片生成 | `/api/online-image` 等 | 状态不统一 | GenerationJob Adapter |
| 视频生成 | `/api/canvas-video` 等 | 状态不统一 | GenerationJob Adapter |
| ComfyUI | `/api/workflows`、`/api/generate` | 缺统一 Job | Workflow Executor Adapter |
| RunningHub | `/api/runninghub/*` | 暴露供应商细节 | Provider Adapter 内部调用 |
| 提示词库 | `/api/prompt-libraries` | 缺分页/版本 | v2 包装或阶段性直接复用 |
| 实时通知 | `/ws/stats` | 不可恢复 | Event Hub + Event Store |
| Chat | `/api/chat*` | 不是 Agent Runtime | 新增 Agent Gateway |
| CLI 检测 | `/api/codex/status` 等 | 无 Session/Task | Runtime Capability + Adapter |

---

## 6. P0：Studio V2 前端开工前必须具备的接口

P0 的目标是让新前端可以建立 App Shell、项目页、资产库、React Flow 主画布和统一任务中心。

## 6.1 Bootstrap

### GET `/api/v2/bootstrap`

一次返回前端启动所需的轻量配置，避免首屏串行调用大量接口。

Query：

```text
project_id 可选
```

响应建议：

```json
{
  "api_version": "2",
  "app": {},
  "capabilities": {},
  "current_project": {},
  "providers": [],
  "models": {},
  "workspaces": [],
  "feature_flags": {}
}
```

底层复用：

- `/api/app-info`
- `/api/config`
- `/api/models`
- `/api/providers`
- `/api/comfyui/instances`

## 6.2 Runtime Capabilities

### GET `/api/v2/runtime-capabilities`

返回：

- 可用 Provider。
- 图片/视频/音频/LLM 能力。
- ComfyUI 可用性。
- Codex/Claude/Gemini/Pi Adapter 可用性。
- ffmpeg 可用性。
- 每种 Runtime 支持的能力和限制。

前端不再分别调用多个 `status` 接口并自行拼接。

## 6.3 Project API

```text
GET    /api/v2/projects
POST   /api/v2/projects
GET    /api/v2/projects/{project_id}
PATCH  /api/v2/projects/{project_id}
DELETE /api/v2/projects/{project_id}
```

要求：

- 标准分页或明确限制。
- 统一 `revision`。
- 删除支持归档/回收站，而不是直接移动画布到默认项目。

## 6.4 Canvas API

```text
GET   /api/v2/projects/{project_id}/canvases
POST  /api/v2/projects/{project_id}/canvases
GET   /api/v2/canvases/{canvas_id}
PATCH /api/v2/canvases/{canvas_id}
```

`GET /api/v2/canvases/{canvas_id}` 返回：

```json
{
  "canvas": {
    "id": "...",
    "project_id": "...",
    "title": "...",
    "kind": "generation-flow",
    "revision": 12
  },
  "document": {
    "schema_version": 2,
    "nodes": [],
    "edges": [],
    "viewport": {}
  }
}
```

后端可先通过 LegacyCanvasAdapter 从现有 JSON 转换。

## 6.5 Canvas 增量保存

### POST `/api/v2/canvases/{canvas_id}/operations`

请求：

```json
{
  "base_revision": 12,
  "client_id": "studio-xxx",
  "operations": [
    {
      "operation_id": "op-1",
      "type": "node.position.update",
      "entity_id": "node-1",
      "payload": {"x": 120, "y": 300}
    }
  ]
}
```

响应：

```json
{
  "revision": 13,
  "applied_operation_ids": ["op-1"],
  "updated_at": 0
}
```

第一阶段至少支持：

```text
node.create
node.update
node.position.update
node.delete
edge.create
edge.update
edge.delete
viewport.update
```

冲突返回：

```text
409 CANVAS_REVISION_CONFLICT
```

## 6.6 Canvas Snapshot

### PUT `/api/v2/canvases/{canvas_id}/snapshot`

用于：

- 显式完整保存。
- Legacy 导入。
- Checkpoint。
- Operation Log 压缩。

不用于每次拖动。

## 6.7 Asset Query API

```text
GET  /api/v2/assets
GET  /api/v2/assets/{asset_id}
POST /api/v2/assets/ingest
```

列表参数：

```text
project_id
kind
query
tags
source_type
cursor
limit
sort
```

统一返回：

```json
{
  "items": [],
  "next_cursor": null,
  "total": 0
}
```

`POST /api/v2/assets/ingest` 支持：

- Multipart 上传。
- 远程 URL。
- 共享目录文件。
- 已有本地文件。

批量导入返回 Job ID，不同步阻塞扫描和分析。

## 6.8 Unified Generation Job

### POST `/api/v2/generation-jobs`

请求示例：

```json
{
  "project_id": "project-1",
  "canvas_id": "canvas-1",
  "node_id": "node-1",
  "kind": "image",
  "executor": "auto",
  "provider_id": "runninghub",
  "model": "model-id",
  "workflow_id": null,
  "inputs": {
    "prompt": "...",
    "reference_asset_version_ids": []
  },
  "parameters": {
    "width": 1024,
    "height": 1024
  },
  "idempotency_key": "..."
}
```

响应：

```json
{
  "job": {
    "id": "job-1",
    "status": "queued",
    "progress": 0
  }
}
```

### 查询和控制

```text
GET  /api/v2/generation-jobs
GET  /api/v2/generation-jobs/{job_id}
POST /api/v2/generation-jobs/{job_id}/cancel
POST /api/v2/generation-jobs/{job_id}/retry
```

统一状态枚举：

```text
queued
starting
running
waiting_external
succeeded
failed
cancel_requested
cancelled
```

底层 Adapter 映射到现有图片、视频、ComfyUI、RunningHub、即梦和 Midjourney 接口实现。

## 6.9 Studio Event API

### WebSocket

```text
WS /ws/v2/events?project_id={projectId}&after_sequence={sequence}
```

### 补拉

```text
GET /api/v2/events?project_id={projectId}&after_sequence={sequence}&limit=500
```

事件 Envelope：

```json
{
  "event_id": "evt-1",
  "sequence": 1024,
  "timestamp": "2026-08-05T08:00:00Z",
  "project_id": "project-1",
  "aggregate_type": "generation_job",
  "aggregate_id": "job-1",
  "type": "generation.job.progress",
  "payload": {}
}
```

P0 事件类型：

```text
canvas.updated
canvas.operation.applied
asset.created
asset.updated
asset.deleted
generation.job.created
generation.job.progress
generation.job.succeeded
generation.job.failed
generation.job.cancelled
```

---

## 7. P1：AI 影视创作核心领域接口

## 7.1 Project Bible

```text
GET   /api/v2/projects/{project_id}/bible
PATCH /api/v2/projects/{project_id}/bible
GET   /api/v2/projects/{project_id}/bible/versions
POST  /api/v2/projects/{project_id}/bible/versions/{version_id}/restore
```

## 7.2 Scripts

```text
GET    /api/v2/projects/{project_id}/scripts
POST   /api/v2/projects/{project_id}/scripts
GET    /api/v2/scripts/{script_id}
PATCH  /api/v2/scripts/{script_id}
DELETE /api/v2/scripts/{script_id}
GET    /api/v2/scripts/{script_id}/versions
POST   /api/v2/scripts/{script_id}/analyze
```

`analyze` 返回 Agent Task 或 Domain Job ID，不同步返回超大分析结果。

## 7.3 Characters

```text
GET    /api/v2/projects/{project_id}/characters
POST   /api/v2/projects/{project_id}/characters
GET    /api/v2/characters/{character_id}
PATCH  /api/v2/characters/{character_id}
DELETE /api/v2/characters/{character_id}
POST   /api/v2/characters/{character_id}/assets:link
DELETE /api/v2/characters/{character_id}/assets/{asset_id}
```

## 7.4 Scenes and Props

```text
GET/POST /api/v2/projects/{project_id}/scenes
GET/PATCH/DELETE /api/v2/scenes/{scene_id}
GET/POST /api/v2/projects/{project_id}/props
GET/PATCH/DELETE /api/v2/props/{prop_id}
```

## 7.5 Shots

```text
GET    /api/v2/projects/{project_id}/shots
POST   /api/v2/projects/{project_id}/shots
POST   /api/v2/projects/{project_id}/shots:batch
GET    /api/v2/shots/{shot_id}
PATCH  /api/v2/shots/{shot_id}
DELETE /api/v2/shots/{shot_id}
POST   /api/v2/shots:reorder
```

查询支持：

```text
scene_id
status
character_id
cursor
limit
sort
```

## 7.6 Storyboards

```text
GET    /api/v2/shots/{shot_id}/storyboard-frames
POST   /api/v2/shots/{shot_id}/storyboard-frames
PATCH  /api/v2/storyboard-frames/{frame_id}
DELETE /api/v2/storyboard-frames/{frame_id}
POST   /api/v2/shots/{shot_id}/storyboard-frames:reorder
```

## 7.7 Artifact API

```text
GET    /api/v2/artifacts
POST   /api/v2/artifacts
GET    /api/v2/artifacts/{artifact_id}
PATCH  /api/v2/artifacts/{artifact_id}
DELETE /api/v2/artifacts/{artifact_id}
GET    /api/v2/artifacts/{artifact_id}/versions
POST   /api/v2/artifacts/{artifact_id}/versions/{version_id}/restore
POST   /api/v2/artifacts/{artifact_id}/links
DELETE /api/v2/artifacts/{artifact_id}/links/{link_id}
```

Artifact Link 用于关联：

- Project。
- Script。
- Character。
- Scene。
- Shot。
- Canvas Node。
- Agent Task。
- Generation Job。

## 7.8 Asset Version and Reference API

```text
GET  /api/v2/assets/{asset_id}/versions
POST /api/v2/assets/{asset_id}/versions
POST /api/v2/assets/{asset_id}/references
GET  /api/v2/assets/{asset_id}/references
DELETE /api/v2/assets/{asset_id}/references/{reference_id}
```

删除资产前，服务端返回引用情况：

```text
409 ASSET_IN_USE
```

除非请求明确使用安全的强制删除策略。

---

## 8. P1：Agent Gateway API

## 8.1 设计边界

后端负责：

- Agent Profile 配置。
- ACP/CLI Adapter。
- 进程生命周期。
- Session 与 Task 映射。
- 项目上下文组装。
- Skill 解析。
- Tool Gateway。
- 权限请求转发。
- Artifact 保存。
- 事件流。

后端不负责重新实现：

- Agent 自主规划循环。
- Claude/Codex/Pi 已有的上下文和工具调用内核。

## 8.2 Profiles

```text
GET   /api/v2/agent-profiles
GET   /api/v2/agent-profiles/{profile_id}
POST  /api/v2/agent-profiles/{profile_id}/probe
```

管理页面后续可增加 Profile CRUD；普通创作页面只读可用 Profile。

## 8.3 Skills

```text
GET /api/v2/skills
GET /api/v2/skills/{skill_id}
```

列表响应至少包含：

```text
id
name
description
version
input_schema
output_schema
required_capabilities
tool_policy
```

## 8.4 Sessions

```text
POST /api/v2/agent-sessions
GET  /api/v2/agent-sessions
GET  /api/v2/agent-sessions/{session_id}
POST /api/v2/agent-sessions/{session_id}/close
```

创建请求：

```json
{
  "project_id": "project-1",
  "profile_id": "codex-default",
  "workspace": {},
  "context_policy": {}
}
```

## 8.5 Tasks

```text
POST /api/v2/agent-sessions/{session_id}/tasks
GET  /api/v2/agent-tasks
GET  /api/v2/agent-tasks/{task_id}
POST /api/v2/agent-tasks/{task_id}/cancel
POST /api/v2/agent-tasks/{task_id}/retry
POST /api/v2/agent-tasks/{task_id}/continue
```

创建请求：

```json
{
  "skill_id": "storyboard-director",
  "instruction": "...",
  "input_artifact_ids": [],
  "input_asset_version_ids": [],
  "canvas_context": {
    "canvas_id": "...",
    "selected_node_ids": []
  },
  "permission_policy": "ask"
}
```

## 8.6 Permission Decisions

```text
POST /api/v2/agent-tasks/{task_id}/permissions/{request_id}/approve
POST /api/v2/agent-tasks/{task_id}/permissions/{request_id}/deny
```

请求必须包含原始 request revision，防止批准过期请求。

## 8.7 Agent Events

事件类型建议：

```text
agent.session.started
agent.session.closed
agent.task.created
agent.task.status_changed
agent.message.delta
agent.plan.updated
agent.tool_call.started
agent.tool_call.completed
agent.permission.requested
agent.permission.resolved
agent.artifact.created
agent.task.completed
agent.task.failed
```

所有 Agent 事件进入同一 `/ws/v2/events`，而不是另开一个互不兼容的消息体系。

---

## 9. P1：Workflow Registry

现有本地工作流和 RunningHub 工作流需要统一成前端可理解的 Registry。

```text
GET    /api/v2/workflows
POST   /api/v2/workflows
GET    /api/v2/workflows/{workflow_id}
PATCH  /api/v2/workflows/{workflow_id}
DELETE /api/v2/workflows/{workflow_id}
POST   /api/v2/workflows/{workflow_id}/probe
POST   /api/v2/workflows/{workflow_id}/execute
```

统一字段：

```text
id
name
executor_type        local-comfyui / runninghub / external
version
input_schema
output_schema
capabilities
thumbnail_asset_id
enabled
raw_reference
```

`execute` 内部仍创建 GenerationJob。

---

## 10. P2：增强接口

## 10.1 全局搜索

```text
GET /api/v2/search
```

支持跨：

- 项目。
- 资产。
- 角色。
- 场景。
- 镜头。
- Artifact。
- Prompt。

## 10.2 Activity / Task Center

```text
GET /api/v2/activity
```

聚合：

- GenerationJob。
- AgentTask。
- Asset Ingest Job。
- Export Job。

## 10.3 Review and Approval

```text
POST /api/v2/reviews
PATCH /api/v2/reviews/{review_id}
```

用于镜头、分镜、生成结果和 Agent Artifact 的确认流程。

## 10.4 Project Export and Import

```text
POST /api/v2/projects/{project_id}/exports
POST /api/v2/projects/imports
GET  /api/v2/export-jobs/{job_id}
```

## 10.5 Audit

```text
GET /api/v2/audit-events
```

用于文件删除、共享目录、Agent Tool Call 和权限决策审计。

---

## 11. 统一响应和错误规范

## 11.1 成功响应

单对象：

```json
{
  "data": {},
  "meta": {}
}
```

列表：

```json
{
  "data": [],
  "page": {
    "next_cursor": null,
    "total": 0
  }
}
```

接受异步任务：

```text
HTTP 202
```

```json
{
  "data": {
    "job_id": "job-1",
    "status": "queued"
  }
}
```

## 11.2 错误响应

```json
{
  "error": {
    "code": "CANVAS_REVISION_CONFLICT",
    "message": "画布已被其他客户端更新",
    "details": {},
    "request_id": "req-1",
    "retryable": true
  }
}
```

建议错误码：

```text
VALIDATION_ERROR
NOT_FOUND
REVISION_CONFLICT
CANVAS_REVISION_CONFLICT
ASSET_IN_USE
JOB_NOT_CANCELLABLE
PROVIDER_UNAVAILABLE
RUNTIME_UNAVAILABLE
AGENT_PERMISSION_REQUIRED
AGENT_SESSION_CLOSED
UPSTREAM_TIMEOUT
```

---

## 12. 统一并发与幂等

## 12.1 Revision

以下对象必须有 revision：

- Project Bible。
- Script。
- Character/Scene/Shot。
- Canvas Document。
- Artifact。

更新请求携带：

```text
If-Match
```

或 Body 中的 `base_revision`。

## 12.2 Idempotency

以下接口支持：

```text
Idempotency-Key
```

- 创建 GenerationJob。
- 创建 AgentTask。
- 资产批量导入。
- 项目导出。

## 12.3 Operation ID

Canvas Operation 必须有客户端生成的 `operation_id`，服务端需要去重。

---

## 13. 数据存储演进建议

## 13.1 第一阶段

仍可使用现有 JSON 和目录作为底层，增加 Repository 层和 V2 DTO。

建议先落地：

```text
data/v2/
├── projects/
├── assets/
├── artifacts/
├── jobs/
├── agents/
└── events/
```

## 13.2 第二阶段

当实体和查询复杂度增加后，引入 SQLite 作为元数据存储：

- 项目。
- 资产。
- 版本。
- 引用关系。
- 镜头。
- 任务。
- 事件序号。

媒体文件仍存文件系统，不把大文件写进数据库。

这属于渐进演进，不要求 Studio V2 初期就完成数据库迁移。

---

## 14. 后端代码组织建议

不要求立即移动整个应用，但新增代码不要继续全部追加到 `main.py`。

```text
backend/
├── api/
│   └── v2/
│       ├── bootstrap.py
│       ├── projects.py
│       ├── assets.py
│       ├── canvases.py
│       ├── generation_jobs.py
│       ├── artifacts.py
│       ├── agents.py
│       └── events.py
├── domain/
├── repositories/
├── services/
├── adapters/
│   ├── legacy_canvas.py
│   ├── providers/
│   ├── comfyui.py
│   └── agent_runtimes/
└── schemas/
```

FastAPI 主应用只负责注册 Router 和已有初始化逻辑。

---

## 15. 实施顺序

## Phase B0：API 事实固化

- 保存现有 API 盘点文档。
- 导出当前 `/openapi.json` 作为测试基线。
- 为关键 Legacy API 增加回归测试。
- 不修改现有页面行为。

## Phase B1：V2 Skeleton

- 建立 `/api/v2` Router。
- 统一响应和错误结构。
- 实现 Bootstrap 和 Runtime Capabilities。
- 实现 Request ID。

## Phase B2：Project、Canvas、Asset

- Project V2。
- LegacyCanvasAdapter。
- Canvas Operation API。
- Asset 分页查询和 Ingest Job。
- Studio V2 可开始 App Shell 和 React Flow 开发。

## Phase B3：Generation Job

- 统一 Job Repository。
- 把现有图片、视频、ComfyUI 和 RunningHub 调用接入 Adapter。
- 统一取消、重试、结果资产化和错误结构。

## Phase B4：Event Hub

- Event Envelope。
- sequence。
- WebSocket 订阅。
- REST 补拉。
- 将 Legacy 广播桥接到 V2 事件。

## Phase B5：影视领域

- Project Bible。
- Script。
- Character/Scene/Prop。
- Shot/Storyboard。
- Artifact 和引用关系。

## Phase B6：Agent Gateway

- Agent Profile。
- Skill Registry。
- Session/Task。
- ACP/CLI Adapter。
- Tool Gateway。
- Permission 和 Artifact 事件。

---

## 16. 前端与后端并行开发边界

前端无需等待全部后端完成。

前端最早可以基于以下 Contract 开工：

1. `GET /api/v2/bootstrap`
2. Project V2 CRUD
3. Canvas V2 Read
4. Canvas Operation API
5. Asset Query API
6. GenerationJob Mock Contract
7. Event Envelope Mock

后端可以先返回 Mock/Adapter 数据，再逐步接入现有实现。

前端必须通过 Zod 校验这些 DTO，不直接依赖 Legacy JSON。

---

## 17. P0 验收标准

### Project

- 新前端能加载、创建和切换项目。
- 项目响应包含稳定 ID、revision 和更新时间。

### Canvas

- 能读取 Legacy 画布并转换为 V2 Document。
- 节点拖动后只提交坐标 Operation。
- 100 个节点连续拖动不会频繁上传完整画布。
- 冲突返回统一错误码和最新 revision。

### Asset

- 资产列表支持分页/游标。
- 可按项目、类型和关键词筛选。
- 列表不返回完整资产库 JSON。
- 上传或导入返回资产或 Job ID。

### Generation

- 图片、视频和 ComfyUI 任务使用同一 Job DTO。
- 新前端不直接轮询 RunningHub/即梦/Midjourney 专用接口。
- 成功结果生成 AssetVersion。
- 失败返回统一错误结构。

### Event

- WebSocket 事件包含 sequence。
- 断线后可以通过 REST 补拉。
- 同一 Job 的事件顺序可确定。

---

## 18. 本阶段明确不做

- 不删除 Legacy API。
- 不整体重写 `main.py` 后再启动 Studio V2。
- 不把所有供应商接口重新实现一遍。
- 不在浏览器中直接启动 CLI。
- 不自研 Agent Harness。
- 不要求第一阶段支持多人实时协同编辑。
- 不要求第一阶段引入独立数据库服务。
- 不让 Agent 直接访问数据库或任意扫描本机目录。

---

## 19. 最终决策摘要

| 决策项 | 决策 |
|---|---|
| 后端技术栈 | 保留 FastAPI |
| Legacy API | 保留并行运行 |
| 新前端接口 | 新增 `/api/v2` |
| 生成任务 | 统一 GenerationJob |
| 画布保存 | Operation + Snapshot |
| 资产模型 | Asset + AssetVersion + Reference |
| 结构化成果 | Artifact + Version + Link |
| 实时通信 | `/ws/v2/events` + REST 补拉 |
| Agent | Agent Gateway + ACP/CLI Adapter |
| Agent Harness | 不自研 |
| 数据迁移 | 渐进式 Adapter，不大爆炸重写 |
| 前端开工条件 | P0 Contract 可用即可 |

---

## 20. 最终原则

> 现有后端是能力实现层，不是必须推倒的旧系统。

> Studio V2 需要新增的是稳定的领域 Contract、统一 Job、增量画布操作、可恢复事件和 Agent Gateway。

> 新前端不感知供应商细节，不直接处理上游 raw，不以文件路径作为核心业务 ID。

> 后端演进应优先建立 Adapter 和 Service 边界，再逐步拆分 `main.py`，而不是先进行长期的大规模重构。
