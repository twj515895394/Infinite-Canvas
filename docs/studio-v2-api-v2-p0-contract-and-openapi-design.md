# Infinite-Canvas Studio V2 `/api/v2` P0 Contract 与 OpenAPI 详细设计

> 文档状态：详细设计基线  
> 版本：v1.0  
> 日期：2026-08-05  
> 适用仓库：`twj515895394/Infinite-Canvas`  
> 前置文档：  
> - `docs/current-backend-api-capability-inventory.md`  
> - `docs/studio-v2-backend-api-gap-and-v2-design.md`  
> - `docs/studio-v2-information-architecture-and-core-workflows.md`

---

## 1. 文档目的

本文档将 Studio V2 的 P0 后端能力细化为可实施的 REST、WebSocket、Pydantic DTO 和 OpenAPI Contract。

P0 Contract 支撑以下前端能力：

- Studio App 启动。
- Runtime 能力检测。
- 项目列表和项目概览基础版。
- Generation Flow 画布读取与增量保存。
- Asset Library / Asset Drawer 基础版。
- 统一图片、视频和工作流任务。
- Task Shelf。
- WebSocket 实时更新与断线补拉。

本文档不包含 Script、Character、Scene、Shot、Storyboard、Artifact 和 Agent Gateway 的完整 P1 Contract。

---

## 2. Contract 总体原则

## 2.1 Source of Truth

后端 Pydantic Model 是 Contract 的实现源，FastAPI 自动生成 OpenAPI。

要求：

- 所有 `/api/v2` JSON 接口必须声明请求和响应 Model。
- 不使用裸 `dict`、`Dict[str, Any]` 作为顶层请求和响应。
- 允许在节点 `data`、Provider 参数和事件 `payload` 等扩展点使用受控 JSON Object。
- 所有错误响应进入 OpenAPI。
- OpenAPI 生成结果进入版本管理或 CI Artifact。

## 2.2 前端类型

推荐流程：

```text
Pydantic Models
→ FastAPI OpenAPI
→ TypeScript API Types
→ Frontend API Client
→ Critical Runtime Zod Validation
```

说明：

- TypeScript 类型由 OpenAPI 生成，减少手工重复定义。
- WebSocket Event、Legacy Canvas、Provider Raw Data 和本地缓存必须额外使用 Zod 运行时校验。
- 业务组件不得直接消费未校验的 Legacy 或上游 Raw Response。

## 2.3 不使用全局 `data` 包装

成功响应直接返回明确资源或集合：

```json
{
  "project": {}
}
```

或：

```json
{
  "items": [],
  "page": {}
}
```

不统一包装为：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

原因：HTTP Status 已表达基础结果；强制 `data` 包装增加嵌套并弱化 OpenAPI 类型。

## 2.4 JSON 命名

统一使用 `snake_case`：

```text
project_id
created_at
current_version_id
next_cursor
```

不在同一 Contract 中混用 `webappId`、`taskId` 和 `project_id`。

供应商字段只存在于 Adapter 内部。

## 2.5 时间

- API 对外统一 ISO 8601 UTC 字符串。
- 示例：`2026-08-05T09:12:30.125Z`。
- 不在 V2 API 中暴露秒级或毫秒级裸 Unix Timestamp。
- 内部 Legacy Timestamp 在 Adapter 中转换。

## 2.6 ID

ID 为不透明字符串，前端不得解析 ID 内容。

建议前缀：

```text
prj_
cnv_
ast_
avr_
job_
evt_
op_
```

后端可继续使用 UUID 生成，不要求 P0 引入数据库特定 ID。

## 2.7 空值

- 集合字段返回空数组，不返回 `null`。
- 可选单值可以返回 `null`。
- PATCH 中“字段未提供”和“明确设置为 null”必须可区分。
- Pydantic 使用 `model_fields_set` 或专用 Patch Model 判断。

---

## 3. HTTP 与 Header 约定

## 3.1 通用请求 Header

| Header | 必填 | 用途 |
|---|---|---|
| `X-Client-Id` | Studio 写请求必填 | 标识浏览器 Tab / 客户端实例 |
| `X-Request-Id` | 可选 | 客户端链路 ID；缺失时服务端生成 |
| `Idempotency-Key` | 创建长任务时必填 | 防止重复提交 |
| `If-Match` | 部分资源更新 | 乐观锁 Revision / ETag |

## 3.2 通用响应 Header

| Header | 用途 |
|---|---|
| `X-Request-Id` | 服务端链路 ID |
| `ETag` | 当前资源 Revision，例如 `"12"` |
| `Retry-After` | 429、503 或可重试等待时间 |

## 3.3 HTTP Status

| Status | 使用场景 |
|---:|---|
| 200 | 查询和普通更新成功 |
| 201 | 资源或 Job 创建成功 |
| 202 | 已接受异步操作 |
| 204 | 无响应体的删除或控制操作 |
| 400 | 请求语义错误 |
| 404 | 资源不存在 |
| 409 | Revision 冲突、重复资源、引用冲突 |
| 413 | 上传或请求体过大 |
| 415 | 不支持的媒体类型 |
| 422 | Schema 校验失败 |
| 429 | 速率或并发限制 |
| 502 | 上游 Provider 错误 |
| 503 | Runtime 暂不可用 |

---

## 4. 标准错误模型

Content-Type：

```text
application/problem+json
```

DTO：

```python
class ApiProblem(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str
    code: str
    request_id: str
    retryable: bool = False
    field_errors: list[FieldError] = []
    context: dict[str, JsonValue] = {}
```

FieldError：

```python
class FieldError(BaseModel):
    path: str
    code: str
    message: str
```

示例：

```json
{
  "type": "/problems/canvas-revision-conflict",
  "title": "Canvas revision conflict",
  "status": 409,
  "detail": "画布已被另一个客户端更新。",
  "code": "CANVAS_REVISION_CONFLICT",
  "request_id": "req_123",
  "retryable": true,
  "field_errors": [],
  "context": {
    "expected_revision": 18,
    "current_revision": 20
  }
}
```

### 4.1 P0 Error Code

```text
VALIDATION_FAILED
RESOURCE_NOT_FOUND
PROJECT_NOT_FOUND
CANVAS_NOT_FOUND
CANVAS_REVISION_CONFLICT
CANVAS_OPERATION_REJECTED
ASSET_NOT_FOUND
ASSET_INGEST_FAILED
ASSET_IN_USE
GENERATION_INVALID_INPUT
GENERATION_RUNTIME_UNAVAILABLE
GENERATION_PROVIDER_ERROR
GENERATION_JOB_NOT_CANCELLABLE
IDEMPOTENCY_CONFLICT
RATE_LIMITED
INTERNAL_ERROR
```

---

## 5. 分页模型

P0 统一使用 Cursor Pagination。

```python
class PageInfo(BaseModel):
    next_cursor: str | None = None
    has_more: bool = False
    limit: int
    total: int | None = None
```

集合响应：

```json
{
  "items": [],
  "page": {
    "next_cursor": null,
    "has_more": false,
    "limit": 50,
    "total": 0
  }
}
```

规则：

- `limit` 默认 50。
- 最大 200。
- Asset Grid 可按需使用 80～120。
- Cursor 是不透明字符串。
- 不允许前端拼接或解析 Cursor。
- `total` 计算成本高时允许为 `null`。

---

## 6. JSON 基础类型

```python
JsonScalar = str | int | float | bool | None
JsonValue = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]
JsonObject = dict[str, JsonValue]
```

以下字段允许 `JsonObject`：

- Canvas Node `data`。
- Canvas Edge `data`。
- Project `settings`。
- GenerationJob `parameters`。
- Event `payload`。

但每个具体 `kind` 应在 Service 层做二次 Schema 校验。

---

## 7. Bootstrap API

## 7.1 GET `/api/v2/bootstrap`

用途：一次提供 Studio App 首屏所需的轻量数据。

Query：

```text
project_id: string，可选
```

响应 DTO：

```python
class BootstrapResponse(BaseModel):
    api_version: Literal["2"]
    app: AppInfo
    capabilities: RuntimeCapabilitiesSummary
    current_project: ProjectSummary | None
    recent_projects: list[ProjectSummary]
    feature_flags: FeatureFlags
    preferences: StudioPreferences
```

### AppInfo

```python
class AppInfo(BaseModel):
    name: str
    version: str
    build: str | None = None
    environment: Literal["development", "production"]
    legacy_canvas_enabled: bool
```

### FeatureFlags

```python
class FeatureFlags(BaseModel):
    studio_v2: bool = True
    canvas_operations: bool = True
    generation_jobs: bool = True
    event_replay: bool = True
    agent_gateway: bool = False
    storyboard_workspace: bool = False
    timeline_workspace: bool = False
```

### StudioPreferences

```python
class StudioPreferences(BaseModel):
    theme: Literal["system", "light", "dark"] = "system"
    density: Literal["compact", "standard", "comfortable"] = "standard"
    motion: Literal["system", "full", "reduced"] = "system"
    transparency: Literal["system", "standard", "reduced"] = "system"
    sidebar_collapsed: bool = False
    inspector_width: int = 340
```

### Bootstrap 约束

- 不返回 API Key、Token、绝对敏感路径。
- 不返回完整 Provider 配置。
- 不返回全量 Asset、Canvas 和 Job。
- 响应目标小于 100KB。
- 服务端内部并行汇总 Legacy 配置。

---

## 8. Runtime Capabilities API

## 8.1 GET `/api/v2/runtime-capabilities`

响应：

```python
class RuntimeCapabilitiesResponse(BaseModel):
    capabilities: list[RuntimeCapability]
    updated_at: datetime
```

```python
class RuntimeCapability(BaseModel):
    id: str
    name: str
    category: Literal[
        "image", "video", "audio", "llm", "workflow", "agent", "export"
    ]
    available: bool
    status: Literal["ready", "degraded", "unavailable", "unknown"]
    provider_id: str | None = None
    models: list[ModelCapability] = []
    features: list[str] = []
    limits: RuntimeLimits = RuntimeLimits()
    message: str | None = None
```

```python
class ModelCapability(BaseModel):
    id: str
    name: str
    kinds: list[str]
    enabled: bool = True
    parameters_schema: JsonObject = {}
```

```python
class RuntimeLimits(BaseModel):
    max_input_assets: int | None = None
    max_prompt_length: int | None = None
    max_concurrency: int | None = None
    max_upload_bytes: int | None = None
```

### Runtime Capability 原则

- Studio 前端只展示能力，不理解供应商协议。
- Provider ID 可以用于用户主动选择，但不暴露 API Key。
- `parameters_schema` 由 Adapter 统一转换为前端可渲染 Schema。
- Probe 成本高时返回缓存结果并提供 `updated_at`。

---

## 9. Project API

## 9.1 Project DTO

```python
class ProjectSummary(BaseModel):
    id: str
    name: str
    description: str = ""
    status: Literal["active", "archived"] = "active"
    cover: AssetRef | None = None
    last_workspace: WorkspaceRef | None = None
    running_job_count: int = 0
    created_at: datetime
    updated_at: datetime
    revision: int
```

```python
class ProjectDetail(ProjectSummary):
    settings: JsonObject = {}
    statistics: ProjectStatistics = ProjectStatistics()
```

```python
class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    template_id: str | None = None
```

```python
class ProjectPatchRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    cover_asset_id: str | None = None
    status: Literal["active", "archived"] | None = None
    settings: JsonObject | None = None
    base_revision: int
```

## 9.2 Endpoints

```text
GET    /api/v2/projects
POST   /api/v2/projects
GET    /api/v2/projects/{project_id}
PATCH  /api/v2/projects/{project_id}
DELETE /api/v2/projects/{project_id}
POST   /api/v2/projects/{project_id}/restore
```

### GET `/api/v2/projects`

Query：

```text
status=active|archived|all
query
cursor
limit
sort=updated_at_desc|name_asc|created_at_desc
```

响应：

```python
class ProjectListResponse(BaseModel):
    items: list[ProjectSummary]
    page: PageInfo
```

### POST `/api/v2/projects`

- 返回 201。
- 同时创建默认 Generation Flow 可由 `template_id` 决定。
- 响应：`{"project": ProjectDetail}`。

### PATCH `/api/v2/projects/{id}`

- 使用 `base_revision` 乐观锁。
- 冲突返回 `409 PROJECT_REVISION_CONFLICT`。

### DELETE

- 逻辑归档，不移动画布到默认项目。
- 返回 204。
- 真正物理删除不属于 P0 普通 API。

---

## 10. Canvas API

## 10.1 Canvas Metadata

```python
class CanvasSummary(BaseModel):
    id: str
    project_id: str
    title: str
    kind: Literal["generation-flow"]
    icon: str | None = None
    node_count: int = 0
    edge_count: int = 0
    created_at: datetime
    updated_at: datetime
    revision: int
```

```python
class CanvasDetail(BaseModel):
    canvas: CanvasSummary
    document: CanvasDocument
```

## 10.2 Canvas Document

```python
class CanvasDocument(BaseModel):
    schema_version: Literal[2]
    nodes: list[CanvasNode]
    edges: list[CanvasEdge]
    viewport: CanvasViewport
    settings: CanvasSettings = CanvasSettings()
```

```python
class CanvasNode(BaseModel):
    id: str
    kind: str
    position: Point
    size: Size | None = None
    data: JsonObject
    domain_ref: DomainRef | None = None
    parent_id: str | None = None
    z_index: int | None = None
    collapsed: bool = False
```

```python
class CanvasEdge(BaseModel):
    id: str
    source: str
    target: str
    source_handle: str | None = None
    target_handle: str | None = None
    kind: str = "data"
    data: JsonObject = {}
```

```python
class Point(BaseModel):
    x: float
    y: float

class Size(BaseModel):
    width: float
    height: float

class CanvasViewport(BaseModel):
    x: float = 0
    y: float = 0
    zoom: float = Field(default=1, ge=0.05, le=4)
```

```python
class DomainRef(BaseModel):
    type: Literal[
        "asset", "asset_version", "generation_job", "artifact",
        "shot", "character", "scene", "agent_task"
    ]
    id: str
```

## 10.3 Endpoints

```text
GET   /api/v2/projects/{project_id}/canvases
POST  /api/v2/projects/{project_id}/canvases
GET   /api/v2/canvases/{canvas_id}
PATCH /api/v2/canvases/{canvas_id}
```

### Canvas Create

```python
class CanvasCreateRequest(BaseModel):
    title: str = Field(default="未命名流程", min_length=1, max_length=120)
    kind: Literal["generation-flow"] = "generation-flow"
    template_id: str | None = None
    legacy_canvas_id: str | None = None
```

如果提供 `legacy_canvas_id`：

- 通过 LegacyCanvasAdapter 转换。
- 转换失败返回明确字段和不支持节点列表。
- 不修改旧画布。

### Canvas Patch

```python
class CanvasPatchRequest(BaseModel):
    title: str | None = None
    icon: str | None = None
    settings: CanvasSettings | None = None
    base_revision: int
```

---

## 11. Canvas Operation API

## 11.1 Endpoint

```text
POST /api/v2/canvases/{canvas_id}/operations
```

## 11.2 Request

```python
class CanvasOperationBatchRequest(BaseModel):
    base_revision: int
    client_id: str
    operations: list[CanvasOperation] = Field(min_length=1, max_length=200)
```

通用 Operation：

```python
class CanvasOperationBase(BaseModel):
    operation_id: str
    type: str
    timestamp: datetime
```

P0 Operation 类型：

```text
node.create
node.update
node.position.update
node.positions.update
node.delete
edge.create
edge.update
edge.delete
viewport.update
settings.update
```

### node.create

```json
{
  "operation_id": "op_1",
  "type": "node.create",
  "timestamp": "2026-08-05T09:00:00Z",
  "payload": {
    "node": {
      "id": "node_1",
      "kind": "image-generation",
      "position": {"x": 120, "y": 200},
      "data": {}
    }
  }
}
```

### node.update

```json
{
  "operation_id": "op_2",
  "type": "node.update",
  "timestamp": "2026-08-05T09:00:01Z",
  "payload": {
    "node_id": "node_1",
    "patch": {
      "data": {"title": "角色主视觉"},
      "collapsed": false
    }
  }
}
```

### node.positions.update

拖动多个节点结束后一次提交：

```json
{
  "operation_id": "op_3",
  "type": "node.positions.update",
  "timestamp": "2026-08-05T09:00:02Z",
  "payload": {
    "positions": [
      {"node_id": "node_1", "x": 220, "y": 300},
      {"node_id": "node_2", "x": 520, "y": 300}
    ]
  }
}
```

### viewport.update

Viewport 属于低优先级偏好：

```json
{
  "operation_id": "op_4",
  "type": "viewport.update",
  "timestamp": "2026-08-05T09:00:03Z",
  "payload": {"x": -100, "y": -80, "zoom": 0.8}
}
```

## 11.3 Response

```python
class CanvasOperationBatchResponse(BaseModel):
    canvas_id: str
    revision: int
    applied_operation_ids: list[str]
    ignored_operation_ids: list[str] = []
    updated_at: datetime
```

## 11.4 Idempotency

- `operation_id` 在同一 Canvas 内唯一。
- 重复提交已应用 Operation 返回成功，并进入 `ignored_operation_ids`。
- 服务端至少保留近期 Operation ID 去重索引。
- 网络超时后前端可以安全重发同一批次。

## 11.5 冲突处理

当 `base_revision < current_revision`：

第一阶段采用保守策略：

- 返回 409。
- 返回当前 Revision。
- 返回从 `base_revision` 之后的轻量 Operation 摘要，若仍在保留范围。
- 前端重新获取 Canvas 或执行可控 Rebase。

不在 P0 实现 CRDT。

### 可自动合并

服务端后续可对以下操作做安全 Rebase：

- 不同节点的 Position Update。
- Viewport Update。
- 不同 Edge 的创建。

但 P0 默认先拒绝冲突，保证正确性。

---

## 12. Canvas Snapshot API

## 12.1 Endpoint

```text
PUT /api/v2/canvases/{canvas_id}/snapshot
```

Request：

```python
class CanvasSnapshotRequest(BaseModel):
    base_revision: int
    client_id: str
    reason: Literal["manual", "checkpoint", "legacy_import", "compaction"]
    document: CanvasDocument
```

Response：

```python
class CanvasSnapshotResponse(BaseModel):
    canvas_id: str
    revision: int
    snapshot_id: str
    compacted_operations: int
    updated_at: datetime
```

约束：

- 最大请求体需要配置上限。
- Snapshot 不能在每次 Drag Stop 调用。
- 前端普通自动保存优先 Operation。
- 服务端可按 Operation 数量或文档大小自动压缩。

---

## 13. Asset DTO

## 13.1 AssetRef

用于其他 DTO 的轻量引用：

```python
class AssetRef(BaseModel):
    asset_id: str
    version_id: str
    kind: Literal["image", "video", "audio", "document", "workflow"]
    name: str
    preview_url: str | None = None
```

## 13.2 AssetSummary

```python
class AssetSummary(BaseModel):
    id: str
    project_id: str | None
    kind: Literal["image", "video", "audio", "document", "workflow"]
    name: str
    current_version: AssetVersionSummary
    tags: list[str] = []
    source_type: Literal[
        "upload", "generated", "local", "shared_folder", "remote_url", "legacy"
    ]
    reference_count: int = 0
    created_at: datetime
    updated_at: datetime
    revision: int
```

```python
class AssetVersionSummary(BaseModel):
    id: str
    preview_url: str | None
    content_url: str
    mime_type: str
    width: int | None = None
    height: int | None = None
    duration_ms: int | None = None
    size_bytes: int
    checksum: str | None = None
```

## 13.3 AssetDetail

```python
class AssetDetail(AssetSummary):
    description: str = ""
    metadata: JsonObject = {}
    versions: list[AssetVersionSummary] = []
    references: list[AssetReferenceSummary] = []
```

---

## 14. Asset Query API

## 14.1 GET `/api/v2/assets`

Query：

```text
project_id
kind=image,video
tags=character,approved
source_type
query
referenced_by_type
referenced_by_id
cursor
limit
sort=updated_at_desc|created_at_desc|name_asc
```

Response：

```python
class AssetListResponse(BaseModel):
    items: list[AssetSummary]
    page: PageInfo
```

要求：

- 只返回 Grid 所需字段。
- 不返回全部 Version 和 Reference。
- Preview URL 可以直接复用现有 `/api/media-preview`。
- 支持 ETag 或条件请求优化重复加载。

## 14.2 GET `/api/v2/assets/{asset_id}`

返回：

```json
{
  "asset": {}
}
```

## 14.3 PATCH `/api/v2/assets/{asset_id}`

```python
class AssetPatchRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    project_id: str | None = None
    base_revision: int
```

---

## 15. Asset Ingest API

为适配 FastAPI 和不同 Content-Type，P0 分为两个入口。

## 15.1 Multipart 上传

```text
POST /api/v2/assets/ingest/upload
Content-Type: multipart/form-data
```

Form：

```text
files[]
project_id
folder_id 可选
tags 可选 JSON
analyze=true|false
```

响应 202：

```json
{
  "job": {
    "id": "job_ingest_1",
    "kind": "asset_ingest",
    "status": "queued"
  }
}
```

## 15.2 JSON 导入

```text
POST /api/v2/assets/ingest
```

```python
class AssetIngestRequest(BaseModel):
    project_id: str | None = None
    sources: list[AssetIngestSource] = Field(min_length=1, max_length=200)
    tags: list[str] = []
    analyze: bool = True
```

Source：

```python
class AssetIngestSource(BaseModel):
    type: Literal["remote_url", "local_file", "shared_folder_file", "legacy_url"]
    url: str | None = None
    path: str | None = None
    shared_folder_id: str | None = None
    name: str | None = None
```

### 安全要求

- Local File 必须在允许目录中。
- Shared Folder 使用注册 ID 和相对路径。
- Remote URL 防止 SSRF。
- 上传限制大小和扩展名。
- 服务端通过 MIME/文件头校验，不只相信扩展名。

---

## 16. GenerationJob DTO

## 16.1 Job Kind

P0：

```text
image
video
workflow
asset_ingest
asset_analyze
export
```

P1 增加：

```text
audio
agent
script_analyze
storyboard_generate
```

## 16.2 Status

```python
GenerationJobStatus = Literal[
    "queued",
    "starting",
    "running",
    "waiting_external",
    "succeeded",
    "failed",
    "cancel_requested",
    "cancelled",
]
```

## 16.3 Job Summary

```python
class GenerationJobSummary(BaseModel):
    id: str
    project_id: str
    canvas_id: str | None = None
    node_id: str | None = None
    kind: str
    status: GenerationJobStatus
    stage: str | None = None
    progress: float | None = Field(default=None, ge=0, le=1)
    title: str
    provider: ProviderRef | None = None
    model: ModelRef | None = None
    result_assets: list[AssetRef] = []
    error: JobError | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    revision: int
```

```python
class JobError(BaseModel):
    code: str
    message: str
    retryable: bool
    provider_message: str | None = None
    technical_details_available: bool = False
```

## 16.4 Create Request

```python
class GenerationJobCreateRequest(BaseModel):
    project_id: str
    canvas_id: str | None = None
    node_id: str | None = None
    kind: Literal["image", "video", "workflow", "export"]
    title: str | None = None
    execution_policy: ExecutionPolicy = ExecutionPolicy()
    inputs: GenerationInputs
    parameters: JsonObject = {}
    metadata: JsonObject = {}
```

```python
class ExecutionPolicy(BaseModel):
    mode: Literal["auto", "pinned"] = "auto"
    provider_id: str | None = None
    model_id: str | None = None
    workflow_id: str | None = None
    fallback_provider_ids: list[str] = []
```

```python
class GenerationInputs(BaseModel):
    prompt: str | None = None
    negative_prompt: str | None = None
    asset_version_ids: list[str] = []
    text_inputs: dict[str, str] = {}
    structured_inputs: JsonObject = {}
```

### 校验规则

- `mode=pinned` 时对应 Provider / Model / Workflow 必须有效。
- 前端可以选择 Provider，但不提交供应商专用请求格式。
- Adapter 根据 Runtime Capability Schema 校验 `parameters`。
- Canvas Node 和 Job 通过 ID 关联，Job 不复制整个 Node。

## 16.5 Create Endpoint

```text
POST /api/v2/generation-jobs
Idempotency-Key: <uuid>
```

响应 201：

```json
{
  "job": {
    "id": "job_1",
    "project_id": "prj_1",
    "kind": "image",
    "status": "queued",
    "progress": 0,
    "title": "角色主视觉",
    "result_assets": [],
    "created_at": "2026-08-05T09:00:00Z",
    "revision": 1
  }
}
```

## 16.6 Query and Control

```text
GET  /api/v2/generation-jobs
GET  /api/v2/generation-jobs/{job_id}
POST /api/v2/generation-jobs/{job_id}/cancel
POST /api/v2/generation-jobs/{job_id}/retry
GET  /api/v2/generation-jobs/{job_id}/attempts
GET  /api/v2/generation-jobs/{job_id}/technical-details
```

### List Query

```text
project_id
canvas_id
node_id
kind
status
cursor
limit
sort=created_at_desc|updated_at_desc
```

### Cancel

- 已完成任务返回 409 `GENERATION_JOB_NOT_CANCELLABLE`。
- 支持取消的 Adapter 发送上游取消。
- 不支持时进入 `cancel_requested`，并忽略或归档后续结果。

### Retry

```python
class GenerationJobRetryRequest(BaseModel):
    overrides: JsonObject = {}
    execution_policy: ExecutionPolicy | None = None
```

Retry 创建新 Attempt，不覆盖旧错误记录。

---

## 17. Job Attempt

```python
class JobAttempt(BaseModel):
    id: str
    job_id: str
    attempt_no: int
    provider_id: str | None
    model_id: str | None
    upstream_task_id: str | None
    status: GenerationJobStatus
    started_at: datetime | None
    finished_at: datetime | None
    error: JobError | None
```

用途：

- Provider Fallback。
- 用户 Retry。
- 上游超时后续查。
- 保留调试记录。

默认 Job Detail 不返回完整 Raw Response。

---

## 18. Studio Event Contract

## 18.1 Event Envelope

```python
class StudioEvent(BaseModel):
    event_id: str
    sequence: int
    timestamp: datetime
    project_id: str | None
    aggregate_type: str
    aggregate_id: str
    type: str
    payload: JsonObject
```

## 18.2 Sequence

P0 采用全局单调递增 Sequence，简化客户端补拉。

优势：

- 客户端只保存一个 `last_sequence`。
- 跨 Project Task Shelf 也可恢复。
- 后续可增加 Project Filter。

事件存储至少覆盖：

- 最近 24 小时；或
- 最近 100,000 条。

具体取较大可配置值。

## 18.3 WebSocket

```text
WS /ws/v2/events?after_sequence={sequence}&project_id={optional}
```

连接成功第一条消息：

```json
{
  "event_id": "evt_stream_ready",
  "sequence": 1200,
  "timestamp": "2026-08-05T09:00:00Z",
  "project_id": null,
  "aggregate_type": "event_stream",
  "aggregate_id": "global",
  "type": "stream.ready",
  "payload": {
    "current_sequence": 1200,
    "oldest_available_sequence": 500,
    "heartbeat_interval_seconds": 20
  }
}
```

Heartbeat：

```json
{
  "type": "stream.heartbeat",
  "sequence": 1200,
  "timestamp": "2026-08-05T09:00:20Z"
}
```

客户端可以发送：

```json
{"type": "ping"}
```

服务端响应：

```json
{"type": "pong", "timestamp": "..."}
```

## 18.4 Replay API

```text
GET /api/v2/events?after_sequence=1000&limit=500&project_id=prj_1
```

Response：

```python
class EventReplayResponse(BaseModel):
    events: list[StudioEvent]
    next_sequence: int
    has_more: bool
    oldest_available_sequence: int
    current_sequence: int
```

如果请求 Sequence 已过期：

- 返回 409 `EVENT_REPLAY_GAP`。
- 客户端重新拉取相关 Project、Canvas、Job 和 Asset 状态。

## 18.5 P0 Events

```text
project.created
project.updated
project.archived

canvas.created
canvas.updated
canvas.operation.applied
canvas.snapshot.created

asset.created
asset.updated
asset.deleted
asset.ingest.progress

generation.job.created
generation.job.started
generation.job.progress
generation.job.waiting_external
generation.job.succeeded
generation.job.failed
generation.job.cancel_requested
generation.job.cancelled

runtime.capability.changed
```

### Job Progress Payload

```json
{
  "status": "running",
  "stage": "generating",
  "progress": 0.45,
  "message": "正在生成第 2 张图片",
  "revision": 8
}
```

事件 Payload 只放变更摘要；前端需要完整对象时调用 Detail API。

---

## 19. Idempotency

## 19.1 适用接口

- Project Create。
- Canvas Create。
- Asset Ingest。
- GenerationJob Create。
- Retry。

## 19.2 规则

- 使用 `Idempotency-Key` Header。
- Key 作用域为 Endpoint + User/Client。
- 服务端保存请求 Hash 和响应引用。
- 同 Key 同请求返回原结果。
- 同 Key 不同请求返回 409 `IDEMPOTENCY_CONFLICT`。
- 建议保存 24 小时。

Canvas Operation 使用 `operation_id` 自身去重，不额外要求 Header。

---

## 20. OpenAPI Tag 与 Operation ID

Tags：

```text
Studio Bootstrap
Runtime Capabilities
Projects
Canvases
Canvas Operations
Assets
Asset Ingest
Generation Jobs
Studio Events
```

Operation ID 示例：

```text
studio_bootstrap_get
runtime_capabilities_list
projects_list
projects_create
canvas_get
canvas_operations_apply
generation_jobs_create
generation_jobs_cancel
```

Operation ID 必须稳定，避免生成客户端方法名频繁变化。

---

## 21. 后端模块结构建议

P0 不要求立即移动全部 Legacy 代码，但新增 V2 代码不得继续无边界追加到 `main.py`。

```text
backend/
├── api_v2/
│   ├── router.py
│   ├── bootstrap.py
│   ├── runtime.py
│   ├── projects.py
│   ├── canvases.py
│   ├── assets.py
│   ├── generation_jobs.py
│   └── events.py
├── schemas/
│   ├── common.py
│   ├── project.py
│   ├── canvas.py
│   ├── asset.py
│   ├── generation_job.py
│   └── event.py
├── services/
│   ├── project_service.py
│   ├── canvas_service.py
│   ├── asset_service.py
│   ├── generation_job_service.py
│   └── event_service.py
├── adapters/
│   ├── legacy_canvas.py
│   ├── legacy_asset.py
│   ├── comfyui.py
│   ├── runninghub.py
│   ├── jimeng.py
│   ├── midjourney.py
│   └── provider.py
└── repositories/
    ├── project_repository.py
    ├── canvas_repository.py
    ├── asset_repository.py
    ├── job_repository.py
    └── event_repository.py
```

如果暂时不新建 `backend/` 根目录，也至少在当前仓库建立等价模块，`main.py` 仅 include Router 和保留 Legacy。

---

## 22. 持久化最低要求

现有 JSON 文件可以继续承载 Legacy，但 P0 新模型需要：

- 原子写入。
- Revision。
- 索引查询。
- Job 重启恢复。
- Event Sequence。
- 并发写安全。

建议：

```text
SQLite：Project、Canvas Metadata、Operation、Asset Metadata、Job、Event
文件系统：Canvas Snapshot、媒体文件、Provider Raw 调试数据
```

P0 不建议继续为每一个新领域对象创建独立大 JSON 文件并全量扫描。

---

## 23. 安全与隐私

- Bootstrap 和 Runtime API 不返回 Secret。
- Provider Raw Data 默认不返回前端。
- Technical Details 需要显式操作，且过滤 Key、Authorization、Cookie。
- Asset URL 必须经过安全路径解析。
- Remote Ingest 防 SSRF 和内网探测。
- Shared Folder 不允许 `..` 逃逸。
- WebSocket 未来接入身份后按 Project 权限过滤。
- CORS 在生产环境收紧，不再使用任意 Origin。

---

## 24. 测试要求

## 24.1 Contract Test

- OpenAPI Snapshot。
- Pydantic Request/Response Validation。
- Error Response Validation。
- Operation ID 唯一性。
- 所有公开 Endpoint 有 Tag、Summary 和 Operation ID。

## 24.2 Canvas Test

- Operation 重放得到相同 Document。
- Operation 重复提交幂等。
- Revision 冲突不会覆盖新数据。
- Snapshot 与 Operation Compaction 正确。
- Legacy Canvas 转换失败可定位到节点。

## 24.3 Job Test

- 同 Idempotency Key 不重复创建。
- Provider 状态映射到统一状态。
- Cancel 和 Retry 状态合法。
- 服务重启后 Job 可恢复或明确标记 Interrupted。
- Result Asset 只创建一次。

## 24.4 Event Test

- Sequence 单调递增。
- WebSocket 重连补拉无重复或可安全去重。
- Replay Gap 正确返回。
- 高频 Progress 合并不丢失最终状态。

---

## 25. 实施顺序

### Step 1：Contract 基础

- Common DTO。
- ApiProblem。
- Request ID Middleware。
- P0 Router。
- OpenAPI Tags 和 Operation IDs。

### Step 2：Bootstrap 与 Runtime

- 包装现有 App Info、Config、Models、Providers 和 CLI Status。
- 不返回 Secret。

### Step 3：Project 与 Canvas Read

- Project Adapter。
- Legacy Canvas Adapter。
- V2 Canvas Document。

### Step 4：Canvas Operation

- Revision。
- Operation Store。
- Snapshot。
- Conflict。

### Step 5：Asset Query 与 Ingest

- 统一 Asset 索引。
- 分页。
- 上传、URL、Local 和 Shared Folder Adapter。

### Step 6：GenerationJob

- Job Repository。
- Adapter Registry。
- 图片、视频、ComfyUI 优先接入。
- Cancel、Retry 和 Attempt。

### Step 7：Event Hub

- Event Store。
- Sequence。
- WebSocket。
- Replay。

### Step 8：Frontend SDK

- 导出 OpenAPI。
- 生成 TypeScript 类型。
- 建立 API Client。
- 建立关键 Zod Schema。

---

## 26. P0 验收标准

- `/api/v2/openapi.json` 或主 OpenAPI 中完整包含 V2 Contract。
- 所有 V2 JSON Endpoint 有 Pydantic Response Model。
- Studio 首屏通过 Bootstrap 和少量并行 Query 完成。
- 前端不再分别理解 RunningHub、即梦、Midjourney 和 ComfyUI 状态。
- 画布拖拽只在 Drag Stop 后发送批量 Position Operation。
- Operation 重发安全。
- 画布 Revision 冲突不会静默覆盖。
- Asset Grid 支持 Cursor Pagination。
- 上传和远程导入返回 Job。
- 图片、视频和工作流统一出现在 Task Shelf。
- WebSocket 断线后可按 Sequence 补拉。
- API Error 可以直接映射到用户提示和技术详情。

---

## 27. 最终原则

> `/api/v2` 不是把现有接口换一个路径，而是建立稳定、可验证、供应商无关的 Studio Contract。

> Pydantic、OpenAPI、TypeScript 和 Zod 必须围绕同一份 Schema 演进，不能各写一套相似但不一致的 DTO。

> 画布使用 Operation 保证高频编辑效率，Snapshot 用于检查点和压缩；两者职责不能混淆。

> GenerationJob 统一执行过程，AssetVersion 承载媒体结果，事件只传变化摘要。

> P0 先保证正确、可恢复和可扩展，不在第一阶段引入 CRDT、复杂微服务和过度抽象。