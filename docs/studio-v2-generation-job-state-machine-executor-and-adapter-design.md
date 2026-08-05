# Infinite-Canvas Studio V2 GenerationJob 状态机、Executor 与供应商 Adapter 详细设计

> 文档状态：字段级详细设计基线（Implementation Contract Baseline）  
> 版本：v1.0  
> 日期：2026-08-05  
> 适用仓库：`twj515895394/Infinite-Canvas`  
> 前置文档：  
> - `docs/adr-001-studio-v2-greenfield-frontend-and-additive-backend.md`  
> - `docs/studio-v2-api-v2-p0-contract-and-openapi-design.md`  
> - `docs/studio-v2-react-flow-node-model-and-registry-design.md`  
> - `docs/studio-v2-asset-artifact-version-reference-and-provenance-design.md`  
> - `docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md`

---

## 1. 文档目的

本文将 Studio V2 的图片、视频、音频、ComfyUI、RunningHub、即梦、Midjourney、Codex 图片工具和其他生成能力统一为可恢复、可审计、可扩展的 GenerationJob 平台。

本文重点解决：

1. Job、Attempt、Executor、Provider Task 和 Output 的职责边界。
2. 同步 HTTP、异步轮询、WebSocket、CLI 子进程和本地工作流如何使用同一任务模型。
3. 如何固定 Prompt、AssetVersion、Workflow Version、参数和执行器配置，防止运行中输入漂移。
4. 如何实现 Queue、Lease、Heartbeat、并发限制、优先级和公平调度。
5. 如何处理 Retry、Provider Fallback、部分成功、超时、取消、服务重启和迟到结果。
6. 如何将任务结果写入 Asset、AssetVersion、Blob、Provenance 和 Canvas Node Binding。
7. 如何避免供应商专用字段和状态扩散到 Studio V2 公共 Contract。
8. 如何在保留现有 `/api/*` 接口的前提下，通过 Adapter 复用已有生成函数。

本文不重新实现图片、视频或工作流模型本身，也不要求一次性拆除当前 `main.py` 中的 Legacy 生成接口。

---

## 2. 现有能力与统一改造目标

当前后端已经具备大量生成执行能力：

- 通用图片 Provider。
- Midjourney 提交、查询和后续动作。
- ModelScope 图片生成。
- Codex CLI + `gpt-image-2-skill` 图片生成与编辑。
- Gemini / Antigravity CLI 相关能力。
- 视频生成与多参考素材输入。
- 即梦 CLI 图片与视频任务。
- ComfyUI 上传、Workflow 提交、History 查询和结果读取。
- RunningHub WebApp / Workflow 提交、轮询、上传和结果解析。
- 本地文件输出、媒体代理、预览和图片格式修正。

当前问题不是缺少生成能力，而是入口、状态、结果和异常模型分散：

```text
不同请求 DTO
不同任务 ID
不同轮询方式
不同进度字段
不同取消能力
不同错误结构
不同结果 URL
不同进程内状态容器
```

Studio V2 的目标是：

```text
Studio GenerationJob
    ↓
Executor Selection
    ↓
GenerationAttempt
    ↓
Provider Adapter
    ↓
Provider Task / Local Process
    ↓
Output Writer
    ↓
Asset + AssetVersion + Provenance
```

旧接口继续服务旧前端；V2 Job Service 通过 Adapter 调用已有底层函数或逐步抽取出的 Service。

---

## 3. 核心概念

## 3.1 GenerationJob

GenerationJob 是用户可见的一次稳定生成意图。

它表示：

- 想生成什么。
- 使用哪些固定输入。
- 允许怎样选择执行器。
- 期望多少输出。
- 结果应该写到哪里。
- 当前整体状态。

Job 不等于某个供应商任务。

示例：

```text
为镜头 S03-08 生成 4 张 16:9 分镜候选图
```

即使第一次 RunningHub Attempt 失败并回退到另一个 Provider，仍然属于同一个 Job。

## 3.2 GenerationAttempt

Attempt 是 Job 的一次实际执行尝试。

```text
Job
├── Attempt 1：RunningHub，失败
├── Attempt 2：ComfyUI，超时
└── Attempt 3：OpenAI-compatible，成功
```

Attempt 固定：

- Executor Snapshot。
- Provider / Model / Workflow。
- 供应商参数映射结果。
- 上游任务 ID。
- 执行阶段。
- 原始状态摘要。
- 错误。
- 成本和输出。

## 3.3 Executor

Executor 是可执行一种或多种生成操作的逻辑执行端。

例如：

```text
provider-image:comfly:gpt-image-2
provider-video:jimeng:seedance2.0
workflow-local:comfy-main:workflow-123
workflow-remote:runninghub:app-456
cli-image:codex:gpt-image-2-skill
```

Executor 不等同于 Provider 配置，也不等同于模型。

它由以下内容组合：

- Adapter 类型。
- Provider / Runtime Profile。
- 模型或 Workflow。
- 支持的 Operation。
- 参数 Schema。
- 输入限制。
- 并发限制。
- 取消和恢复能力。
- 健康状态。

## 3.4 Provider Task

Provider Task 是供应商或本地 Runtime 创建的实际任务或进程。

例如：

- RunningHub Task ID。
- Midjourney Task ID。
- ComfyUI Prompt ID。
- 即梦 Submit ID。
- 本地 CLI PID / Process Handle。
- 同步 HTTP 请求的 Request ID。

Provider Task ID 只属于 Attempt，不进入公共 Node Config。

## 3.5 GenerationOutput

GenerationOutput 是 Attempt 返回的一个候选结果记录。

Output 在写入资源系统前可能处于：

```text
discovered
fetching
validating
ingesting
ready
invalid
ignored
quarantined
```

成功写入后绑定具体 `asset_id` 和 `asset_version_id`。

## 3.6 Input Snapshot

Input Snapshot 是 Job 提交时固定的执行输入。

它包括：

- Prompt 和 Negative Prompt。
- AssetVersion ID。
- ArtifactVersion ID。
- Workflow Version。
- Canvas / Node Revision。
- 结构化参数。
- 目标输出数。
- 运行策略。
- 内容 Checksum。

Job 执行过程中不读取“当前 Asset 版本”或“最新 Canvas 节点配置”。

---

## 4. Job Kind 与 Operation

公共 Contract 不使用供应商名称表达能力。

### 4.1 Job Kind

```python
GenerationJobKind = Literal[
    "image",
    "video",
    "audio",
    "workflow",
    "asset_transform",
    "asset_analyze",
    "export",
]
```

P0 优先：

```text
image
video
workflow
asset_transform
```

### 4.2 Operation

```python
GenerationOperation = Literal[
    "image.generate",
    "image.edit",
    "image.variation",
    "image.upscale",
    "image.outpaint",
    "video.generate",
    "video.image_to_video",
    "video.frames_to_video",
    "video.extend",
    "video.upscale",
    "audio.generate",
    "workflow.run",
    "asset.transcode",
    "asset.thumbnail",
    "asset.caption",
]
```

Operation 决定输入校验和 Executor 匹配，不由前端提交供应商协议字段。

---

## 5. Job 状态机

## 5.1 Job Status

```python
GenerationJobStatus = Literal[
    "queued",
    "preparing",
    "running",
    "waiting_external",
    "finalizing",
    "succeeded",
    "partially_succeeded",
    "failed",
    "cancel_requested",
    "cancelled",
    "interrupted",
]
```

说明：

- `queued`：已持久化，等待调度。
- `preparing`：正在解析输入、选择 Executor 或准备上传。
- `running`：Attempt 正在主动执行。
- `waiting_external`：已提交上游，等待轮询、回调或结果。
- `finalizing`：正在下载、校验、写 Blob、创建 Asset 和 Provenance。
- `succeeded`：达到输出要求并完成归档。
- `partially_succeeded`：至少有一个有效输出，但未达到完整要求或部分结果失败。
- `failed`：没有可接受结果，且无自动 Attempt 可继续。
- `cancel_requested`：用户已请求取消，系统正在尝试停止。
- `cancelled`：任务已停止或后续结果被取消策略处理。
- `interrupted`：服务重启或执行器丢失，无法确认实际状态。

`partially_succeeded` 是本专项设计对早期 P0 状态枚举的补充。前端应把它视为终态成功类别，但明确显示缺失输出和警告。

## 5.2 Job 状态流

```text
queued
  ├── preparing
  └── cancel_requested → cancelled

preparing
  ├── running
  ├── waiting_external
  ├── failed
  ├── interrupted
  └── cancel_requested

running
  ├── waiting_external
  ├── finalizing
  ├── failed → queued（自动 Fallback 创建新 Attempt）
  ├── interrupted
  └── cancel_requested

waiting_external
  ├── running
  ├── finalizing
  ├── failed → queued（自动 Fallback 创建新 Attempt）
  ├── interrupted
  └── cancel_requested

finalizing
  ├── succeeded
  ├── partially_succeeded
  ├── failed
  └── cancel_requested

cancel_requested
  ├── cancelled
  ├── finalizing（上游已产生结果，按取消后结果策略处理）
  └── interrupted
```

## 5.3 终态

```text
succeeded
partially_succeeded
failed
cancelled
interrupted
```

`interrupted` 可重试，但不会自动宣称原上游任务已经失败。

## 5.4 不变量

1. Job 创建后 Input Snapshot 不可修改。
2. Job 的 `active_attempt_id` 最多一个。
3. 已成功写入的 Output 不因后续 Attempt 失败而删除。
4. Job 进入终态后，除显式 Retry 外不创建新 Attempt。
5. Retry 不覆盖旧 Attempt。
6. 每次 Job 状态变化与 Event Outbox 同事务。
7. Result Asset 必须来自 Output Writer，不允许 Adapter 直接写 Canvas JSON。

---

## 6. Attempt 状态机

## 6.1 Attempt Status

```python
GenerationAttemptStatus = Literal[
    "created",
    "preparing",
    "submitting",
    "submitted",
    "polling",
    "streaming",
    "collecting",
    "finalizing",
    "succeeded",
    "partially_succeeded",
    "failed",
    "cancel_requested",
    "cancelled",
    "abandoned",
    "interrupted",
]
```

### `abandoned`

用于：

- Fallback 后旧 Attempt 不再作为活动执行。
- 上游任务无法取消，但结果不再自动应用。
- Recovery 判断该 Attempt 不应继续驱动 Job。

它不代表上游实际停止。

## 6.2 Attempt Stage

Status 表达生命周期，Stage 表达当前工作。

建议 Stage：

```text
validating
resolving_inputs
selecting_executor
preparing_workspace
uploading_inputs
building_request
submitting
awaiting_provider
polling_provider
streaming_provider
downloading_outputs
validating_outputs
ingesting_blobs
creating_assets
generating_previews
recording_provenance
binding_results
completed
```

前端优先展示统一 Stage，不展示供应商内部状态码。

## 6.3 Provider Raw Status

Attempt 保存：

```text
provider_status
provider_status_message
provider_progress
provider_payload_ref
```

用于诊断和 Recovery，但不成为公共状态枚举。

---

## 7. 执行策略

## 7.1 ExecutionPolicy

```python
class GenerationExecutionPolicy(BaseModel):
    mode: Literal["auto", "pinned"] = "auto"
    executor_id: str | None = None
    provider_id: str | None = None
    model_id: str | None = None
    workflow_id: str | None = None

    fallback_mode: Literal[
        "none",
        "same_provider",
        "compatible_executor",
        "explicit_list",
    ] = "none"
    fallback_executor_ids: list[str] = []
    max_attempts: int = Field(default=1, ge=1, le=5)

    timeout_seconds: int | None = None
    priority: Literal["interactive", "normal", "background"] = "normal"
    allow_paid_execution: bool = True
    max_estimated_cost: float | None = None
```

## 7.2 Pinned 模式

用户明确选择 Provider / Model / Workflow 时：

- 默认不跨 Provider Fallback。
- 可以在用户明确开启时使用同 Provider 内替代 Executor。
- Adapter 不可静默更换模型家族。

## 7.3 Auto 模式

系统根据以下条件评分：

```text
Operation 支持
输入类型兼容
尺寸、时长和数量限制
Executor 健康状态
当前并发与队列
项目偏好
成本策略
用户默认 Provider
历史成功率
是否支持取消和恢复
```

P0 不要求复杂机器学习调度，先使用可解释规则评分。

## 7.4 Fallback 规则

只有以下错误默认允许自动 Fallback：

```text
EXECUTOR_UNAVAILABLE
PROVIDER_TEMPORARY_UNAVAILABLE
PROVIDER_RATE_LIMITED
PROVIDER_TIMEOUT
NETWORK_TRANSIENT
LOCAL_RUNTIME_BUSY
```

以下错误默认不自动 Fallback：

```text
INVALID_INPUT
INPUT_ASSET_MISSING
CONTENT_POLICY_REJECTED
AUTHENTICATION_FAILED
PAYMENT_REQUIRED
USER_CANCELLED
OUTPUT_SCHEMA_INVALID
```

原因：换供应商可能改变费用、内容政策、模型效果或用户意图。

---

## 8. 输入模型与快照

## 8.1 Create Request

```python
class GenerationJobCreateRequest(BaseModel):
    project_id: str
    canvas_id: str | None = None
    node_id: str | None = None

    kind: GenerationJobKind
    operation: GenerationOperation
    title: str | None = None

    inputs: GenerationInputs
    parameters: dict[str, JsonValue] = {}
    execution_policy: GenerationExecutionPolicy = GenerationExecutionPolicy()
    output_policy: GenerationOutputPolicy = GenerationOutputPolicy()
    metadata: dict[str, JsonValue] = {}
```

创建长任务必须使用：

```text
Idempotency-Key
```

## 8.2 GenerationInputs

```python
class GenerationInputs(BaseModel):
    prompt: str | None = None
    negative_prompt: str | None = None
    asset_version_ids: list[str] = []
    artifact_version_ids: list[str] = []
    workflow_version_id: str | None = None
    text_inputs: dict[str, str] = {}
    structured_inputs: dict[str, JsonValue] = {}
    seed: int | None = None
```

## 8.3 Input Snapshot

数据库保存规范化 Snapshot：

```python
class GenerationInputSnapshot(BaseModel):
    schema_version: int = 1
    project_id: str
    canvas_ref: VersionedResourceRef | None
    node_ref: VersionedResourceRef | None
    prompt: str | None
    negative_prompt: str | None
    asset_version_refs: list[AssetVersionRef]
    artifact_version_refs: list[ArtifactVersionRef]
    workflow_version_ref: VersionedResourceRef | None
    text_inputs: dict[str, str]
    structured_inputs: dict[str, JsonValue]
    requested_parameters: dict[str, JsonValue]
    checksum: str
    created_at: datetime
```

要求：

- 所有 Current Reference 在提交前解析为具体 Version。
- Snapshot 使用规范化 JSON 计算 SHA-256。
- Adapter 获得 Snapshot，不重新查询节点当前配置。
- 外部 URL 输入应先导入 AssetVersion，或以受控 External Mapping 固定。

## 8.4 Input Resolution

提交 Job 时同步完成轻量校验：

- ID 格式。
- Project 是否存在。
- Operation 基本字段。
- AssetVersion 是否存在。
- 输入数量上限。

大文件读取、远程下载、媒体探测和上传由 Attempt `preparing` 阶段完成。

---

## 9. 输出策略

## 9.1 GenerationOutputPolicy

```python
class GenerationOutputPolicy(BaseModel):
    expected_count: int = Field(default=1, ge=1, le=100)
    minimum_success_count: int = Field(default=1, ge=1, le=100)

    asset_scope: Literal["project", "global"] = "project"
    target_collection_id: str | None = None
    result_name_template: str | None = None
    tags: list[str] = []

    bind_to_node: bool = True
    replace_node_results: bool = False
    set_primary_result: bool = True

    late_result_policy: Literal[
        "archive",
        "keep_unbound",
        "discard_if_safe",
    ] = "archive"
```

## 9.2 多结果规则

并列候选结果创建多个 Asset：

```text
Output 1 → Asset A v1
Output 2 → Asset B v1
Output 3 → Asset C v1
```

只有明确的“修改现有素材”Operation 才默认向目标 Asset 创建新 Version：

```text
image.edit
image.upscale
video.extend
asset.transcode
```

此时 Request 必须包含目标 Asset 或 Source Version 的更新策略。

## 9.3 部分成功

当：

```text
valid_output_count >= minimum_success_count
且
valid_output_count < expected_count
```

Job 进入：

```text
partially_succeeded
```

已完成 Asset 保留，UI 显示缺失数量和可重试剩余结果的操作。

---

## 10. Executor Registry

## 10.1 ExecutorDefinition

```python
class GenerationExecutorDefinition(BaseModel):
    id: str
    name: str
    adapter_type: str

    provider_id: str | None
    model_id: str | None
    workflow_id: str | None

    operations: list[GenerationOperation]
    input_kinds: list[str]
    output_kinds: list[str]
    parameter_schema: dict[str, JsonValue]

    capabilities: GenerationExecutorCapabilities
    limits: GenerationExecutorLimits
    health: ExecutorHealth

    enabled: bool
    priority: int
```

## 10.2 Capabilities

```python
class GenerationExecutorCapabilities(BaseModel):
    asynchronous: bool = False
    streaming: bool = False
    polling: bool = False
    callback: bool = False
    cancellation: bool = False
    recovery: bool = False
    progress: bool = False
    seed: bool = False
    batch_output: bool = False
    cost_estimation: bool = False
    input_upload_required: bool = False
```

## 10.3 Limits

```python
class GenerationExecutorLimits(BaseModel):
    max_input_assets: int | None = None
    max_prompt_length: int | None = None
    max_output_count: int | None = None
    max_width: int | None = None
    max_height: int | None = None
    max_duration_seconds: int | None = None
    supported_mime_types: list[str] = []
    supported_aspect_ratios: list[str] = []
    max_concurrency: int | None = None
```

## 10.4 Registry 来源

Executor 可以由以下内容构建：

```text
现有 API Provider 配置
ComfyUI 实例和 Workflow
RunningHub App / Workflow
本地 CLI Probe
Builtin Asset Transform
未来远程 Worker
```

Registry 对前端返回归一化能力，不返回 API Key、Cookie 或供应商私密配置。

---

## 11. Generation Adapter 协议

## 11.1 统一接口

```python
class GenerationExecutorAdapter(Protocol):
    async def probe(self, executor: ExecutorSnapshot) -> ExecutorProbeResult: ...
    async def validate(
        self,
        executor: ExecutorSnapshot,
        operation: str,
        input_snapshot: GenerationInputSnapshot,
        parameters: dict,
    ) -> AdapterValidationResult: ...

    async def prepare(
        self,
        context: AttemptExecutionContext,
    ) -> PreparedGenerationRequest: ...

    async def submit(
        self,
        context: AttemptExecutionContext,
        request: PreparedGenerationRequest,
    ) -> AdapterSubmitResult: ...

    async def poll(
        self,
        context: AttemptExecutionContext,
        provider_handle: ProviderTaskHandle,
    ) -> AdapterPollResult: ...

    async def cancel(
        self,
        context: AttemptExecutionContext,
        provider_handle: ProviderTaskHandle,
    ) -> AdapterCancelResult: ...

    async def recover(
        self,
        context: AttemptExecutionContext,
        provider_handle: ProviderTaskHandle,
    ) -> AdapterRecoveryResult: ...

    async def collect_outputs(
        self,
        context: AttemptExecutionContext,
        provider_result: ProviderResult,
    ) -> list[DiscoveredOutput]: ...

    def map_error(self, exc: Exception | ProviderError) -> GenerationError: ...
```

Adapter 不能：

- 直接修改 Canvas Document。
- 直接更新 Node 运行状态。
- 直接创建无来源记录的 Asset。
- 把 API Key 写入 Attempt Snapshot。
- 将上游 Raw Response 直接返回给普通前端。

## 11.2 Adapter 类型

```text
sync-http
async-poll
async-callback
websocket-stream
local-process
comfyui
runninghub
legacy-function
asset-transform
```

### sync-http

请求完成即拿到结果，但仍运行在 Job Worker 中，不阻塞创建 Job 的 HTTP 请求。

### async-poll

Submit 返回 Provider Task ID，Worker 按策略轮询。

### local-process

管理 PID、stdout/stderr、Timeout、Cancel 和 Exit Code。

### legacy-function

P0 用于包装已有后端函数。它是迁移适配层，不应成为长期公共接口。

---

## 12. 现有能力 Adapter 映射

## 12.1 通用图片 Provider Adapter

适配：

- OpenAI-compatible。
- APIMart 类协议。
- ModelScope 图片接口。
- 其他同步或异步图片 Provider。

公共输入：

```text
prompt
negative_prompt
asset_version_ids
size / aspect_ratio
quality
count
```

供应商字段在 Adapter 内映射。

## 12.2 Codex Image Skill Adapter

适配当前：

```text
Codex CLI
+
gpt-image-2-skill
```

类型：

```text
local-process
```

应复用：

- 可执行文件探测。
- Auth 文件定位。
- 参数数组构造。
- JSONL / stdout 输出解析。
- 超时处理。
- 输出路径解析。
- 图片尺寸后处理。

但应改为：

```text
CLI 输出文件
→ DiscoveredOutput
→ Output Writer
→ Blob / AssetVersion
```

而不是直接把 `/output/*.png` URL 作为最终资源身份。

## 12.3 Midjourney Adapter

类型：

```text
async-poll
```

支持：

```text
image.generate
image.variation
image.upscale
局部重绘等供应商动作
```

Attempt 保存：

```text
provider_task_id
provider_action
custom_id
provider_status
```

供应商动作不成为新的顶层 Job Kind。

## 12.4 ComfyUI Adapter

类型：

```text
comfyui / async-poll
```

流程：

```text
固定 Workflow Version
→ 解析参数映射
→ 必要输入上传
→ 提交 Prompt
→ 保存 Prompt ID
→ 查询 History / WebSocket
→ 解析输出文件
→ Output Writer
```

Workflow JSON 必须固定版本或 Checksum，不能执行时读取可变文件。

## 12.5 RunningHub Adapter

类型：

```text
runninghub / async-poll
```

支持：

- WebApp。
- Workflow。
- 节点参数映射。
- 钱包策略。
- 上传引用素材。
- 轮询状态。
- 结果 URL 收集。

Attempt Snapshot 保存 App / Workflow 身份和版本摘要，不保存明文钱包 Key。

## 12.6 即梦 Adapter

类型：

```text
local-process 或 async-poll
```

根据具体命令支持：

- 文生图。
- 图生图。
- 文生视频。
- 图生视频。
- 首尾帧。
- 多帧。
- 全能参考。

Adapter 负责把统一输入映射为正确命令，不允许 Job Service 理解即梦命令参数。

## 12.7 Video Provider Adapter

统一处理：

```text
text-to-video
image-to-video
frames-to-video
multimodal-to-video
```

输入 AssetVersion 先由 MediaResolver 解析为本地文件、上传句柄或供应商 URL。

---

## 13. Provider Task Handle

```python
class ProviderTaskHandle(BaseModel):
    provider_task_id: str | None = None
    provider_request_id: str | None = None
    process_id: int | None = None
    callback_token_ref: str | None = None
    submitted_at: datetime
    recovery_data: dict[str, JsonValue] = {}
```

要求：

- 只保存恢复所需最小数据。
- Secret 使用 Secret Reference，不写 Handle。
- `recovery_data` 必须经过 Adapter Schema 校验。
- Raw 大响应保存到受控日志或 Resource 文件，不直接塞数据库。

---

## 14. Queue、Dispatcher 与并发控制

## 14.1 Queue

GenerationJob 和 AgentTask 可共用基础 Worker / Lease 设施，但使用不同 Dispatcher 和并发池。

Job 排序建议：

```text
priority DESC
created_at ASC
```

优先级：

```text
interactive
normal
background
```

## 14.2 公平调度

不能让一个项目的大批量任务长期占满所有 Executor。

P0 使用简单规则：

- 每个 Executor 最大并发。
- 每个 Project 最大活动 Job。
- 同优先级下按项目轮转。
- Background 不抢占 Interactive。

## 14.3 Lease

Attempt 使用：

```text
lease_owner
lease_expires_at
heartbeat_at
```

建议默认：

```text
Lease：60 秒
Heartbeat：15 秒
```

视频和远程工作流轮询等待时间长，但 Worker 仍需持续续租。

## 14.4 Claim

```text
BEGIN IMMEDIATE
→ 查找可执行 queued Job
→ 校验 Executor 并发配额
→ 创建或 Claim Attempt
→ 设置 preparing、Lease
→ 更新 Job preparing
→ 写 Outbox
→ COMMIT
```

事务外执行 Provider 调用。

## 14.5 Backpressure

当 Executor 不可用或达到并发限制：

- Job 保持 queued。
- 可记录 `queue_reason`。
- 不反复创建失败 Attempt。
- 超过 Queue Timeout 后按策略失败或等待用户处理。

---

## 15. Timeout 策略

区分：

```text
queue_timeout
prepare_timeout
submit_timeout
execution_timeout
poll_interval
poll_timeout
download_timeout
finalize_timeout
```

默认值由 Executor Capability 提供，Job Policy 可在允许范围内覆盖。

Timeout 发生后：

1. 尝试 Adapter Cancel。
2. Attempt 标记失败或 abandoned。
3. 根据错误和 Fallback Policy 决定是否新建 Attempt。
4. 不能确认上游停止时保留 Provider Handle，用于 Late Result Recovery。

---

## 16. 取消语义

## 16.1 用户取消

请求：

```text
POST /api/v2/generation-jobs/{job_id}/cancel
```

状态先立即变为：

```text
cancel_requested
```

然后：

- queued：直接 cancelled。
- preparing：停止准备并清理临时文件。
- running / waiting_external：调用 Adapter Cancel。
- finalizing：停止自动绑定，但不破坏已写入 Blob。

## 16.2 Adapter 支持取消

Adapter 返回：

```text
accepted
not_supported
already_finished
not_found
failed
```

`not_supported` 不等于取消失败。系统可以停止本地轮询并将 Attempt 标记 abandoned，但需记录上游可能仍在执行。

## 16.3 迟到结果

用户取消后上游仍成功返回时，不应默认丢弃付费结果。

按 `late_result_policy`：

### archive

- 创建 Asset。
- 标记来源为 `late_after_cancel`。
- 不绑定 Canvas Node。
- 不设置 Primary Result。
- 在 Job Detail 提示“已找回取消后的结果”。

### keep_unbound

- 创建正常 Asset。
- 不绑定 Node。
- 可在 Task Shelf 手动采用。

### discard_if_safe

只有满足以下条件才丢弃：

- 未产生费用或用户明确选择。
- 输出没有被其他对象引用。
- Adapter 和审计策略允许。

---

## 17. Retry 与重新执行

## 17.1 Retry 同一 Job

适用于：

- Input Snapshot 不变。
- 只更换 Executor、Model 或非语义执行参数。
- 需要保留一个用户意图下的 Attempt 历史。

```python
class GenerationJobRetryRequest(BaseModel):
    execution_policy: GenerationExecutionPolicy | None = None
    parameter_overrides: dict[str, JsonValue] = {}
    missing_outputs_only: bool = False
```

Retry：

- 新建 Attempt。
- Job 回到 queued。
- 不删除旧输出。
- `missing_outputs_only=true` 时只补足缺失结果数。

## 17.2 创建新 Job

以下变化应创建新 Job：

- Prompt 改变。
- 输入 AssetVersion 改变。
- Workflow Version 改变。
- Operation 改变。
- 目标语义发生变化。

UI 操作名称应是：

```text
使用修改后的输入重新生成
```

而不是 Retry。

## 17.3 自动 Fallback

自动 Fallback 创建新 Attempt，但不需要用户再次提交 Job。

必须在 Job Timeline 中显示：

```text
Attempt 1：RunningHub 暂时不可用
已根据执行策略切换到 ComfyUI
Attempt 2：运行中
```

不能静默换模型而不告知用户。

---

## 18. Error Taxonomy

```python
GenerationErrorCode = Literal[
    "INVALID_INPUT",
    "INPUT_ASSET_MISSING",
    "INPUT_ASSET_UNREADABLE",
    "WORKFLOW_VERSION_MISSING",
    "EXECUTOR_NOT_FOUND",
    "EXECUTOR_UNAVAILABLE",
    "EXECUTOR_INCOMPATIBLE",
    "EXECUTOR_BUSY",
    "AUTHENTICATION_FAILED",
    "PERMISSION_DENIED",
    "PAYMENT_REQUIRED",
    "PROVIDER_RATE_LIMITED",
    "PROVIDER_REJECTED",
    "CONTENT_POLICY_REJECTED",
    "PROVIDER_TIMEOUT",
    "PROVIDER_TEMPORARY_UNAVAILABLE",
    "NETWORK_TRANSIENT",
    "LOCAL_PROCESS_FAILED",
    "LOCAL_PROCESS_TIMEOUT",
    "OUTPUT_NOT_FOUND",
    "OUTPUT_UNSUPPORTED",
    "OUTPUT_CORRUPTED",
    "OUTPUT_INGEST_FAILED",
    "OUTPUT_SCHEMA_INVALID",
    "CANCEL_FAILED",
    "JOB_INTERRUPTED",
    "INTERNAL_ERROR",
]
```

Error DTO：

```python
class GenerationError(BaseModel):
    code: GenerationErrorCode
    message: str
    retryable: bool
    fallback_allowed: bool
    provider_code: str | None = None
    provider_message: str | None = None
    technical_details_ref: str | None = None
    context: dict[str, JsonValue] = {}
```

普通前端不默认显示原始堆栈和完整上游响应。

---

## 19. Output Writer

Output Writer 是将供应商结果转换为 Studio 资源的唯一入口。

流程：

```text
DiscoveredOutput
→ 下载或定位内容
→ MIME / 文件头校验
→ 尺寸、时长和媒体探测
→ SHA-256
→ 写入 Blob Store
→ 创建 Asset / AssetVersion
→ 创建 Preview / Poster / Proxy
→ 写 Provenance
→ 写 Resource Link
→ 绑定 GenerationOutput
→ 更新 Node Result Binding
```

## 19.1 DiscoveredOutput

```python
class DiscoveredOutput(BaseModel):
    ordinal: int
    kind: Literal["image", "video", "audio", "document", "workflow"]
    source_type: Literal["url", "local_file", "provider_file", "bytes_ref"]
    source: str
    mime_type_hint: str | None = None
    name_hint: str | None = None
    metadata: dict[str, JsonValue] = {}
```

## 19.2 输出验证

至少检查：

- 文件存在或 URL 可访问。
- 内容大小上限。
- MIME 与实际内容一致。
- 图片可解码。
- 视频可探测。
- 输出数是否符合预期。
- Workflow / JSON 是否符合 Schema。

单个输出无效不一定使整个 Job 失败，应根据 `minimum_success_count` 聚合。

## 19.3 Provenance

每个输出记录：

```text
generation_job_id
generation_attempt_id
executor_id
provider_id
model_id
workflow_version_id
input_snapshot_checksum
parameter_snapshot
provider_task_id
output_ordinal
created_at
```

---

## 20. Canvas Node 绑定

GenerationJob 与 React Flow Node 通过：

```text
project_id
canvas_id
node_id
```

关联。

节点文档只保存轻量 Binding：

```text
active_job_id
latest_successful_job_id
result_asset_ids
primary_result_asset_id
```

Job 消息、Attempt、Provider Task、日志和 Output 明细不塞入 Canvas Document。

## 20.1 结果替换

`replace_node_results=true` 只改变 Node 当前结果 Binding，不删除历史 Asset 或历史 Job。

## 20.2 Stale

节点输入修改后：

```text
Input Checksum != latest_successful_job.input_checksum
```

节点显示 Stale，但旧结果仍然可用。

---

## 21. 数据库设计

在 `data/studio-v2/studio.db` 中增加：

```text
generation_jobs
generation_input_snapshots
generation_input_references
generation_attempts
generation_attempt_events
generation_outputs
generation_cost_records
executor_health_snapshots
```

## 21.1 `generation_jobs`

```sql
CREATE TABLE generation_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    canvas_id TEXT,
    node_id TEXT,

    kind TEXT NOT NULL,
    operation TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    stage TEXT,
    priority TEXT NOT NULL DEFAULT 'normal',

    input_snapshot_id TEXT NOT NULL,
    execution_policy_json TEXT NOT NULL,
    output_policy_json TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',

    active_attempt_id TEXT,
    latest_successful_attempt_id TEXT,
    requested_output_count INTEGER NOT NULL DEFAULT 1,
    successful_output_count INTEGER NOT NULL DEFAULT 0,

    queue_reason TEXT,
    progress REAL,
    error_json TEXT,
    cancel_requested_at TEXT,

    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    deleted_at TEXT,

    FOREIGN KEY(input_snapshot_id) REFERENCES generation_input_snapshots(id)
);

CREATE INDEX idx_generation_jobs_project_status
ON generation_jobs(project_id, status, created_at);

CREATE INDEX idx_generation_jobs_canvas_node
ON generation_jobs(canvas_id, node_id, created_at);
```

## 21.2 `generation_input_snapshots`

```sql
CREATE TABLE generation_input_snapshots (
    id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    project_id TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    checksum TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_generation_input_checksum
ON generation_input_snapshots(checksum);
```

相同 Checksum 可以复用 Snapshot，但不能因为去重改变 Job 语义。

## 21.3 `generation_input_references`

```sql
CREATE TABLE generation_input_references (
    id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    role TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    version_id TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY(snapshot_id) REFERENCES generation_input_snapshots(id) ON DELETE CASCADE
);

CREATE INDEX idx_generation_input_refs_resource
ON generation_input_references(resource_type, resource_id, version_id);
```

## 21.4 `generation_attempts`

```sql
CREATE TABLE generation_attempts (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    attempt_no INTEGER NOT NULL,
    status TEXT NOT NULL,
    stage TEXT,

    executor_id TEXT NOT NULL,
    executor_snapshot_json TEXT NOT NULL,
    parameter_snapshot_json TEXT NOT NULL,

    provider_task_id TEXT,
    provider_request_id TEXT,
    provider_status TEXT,
    provider_status_message TEXT,
    provider_progress REAL,
    recovery_data_json TEXT NOT NULL DEFAULT '{}',

    output_count INTEGER NOT NULL DEFAULT 0,
    error_json TEXT,
    technical_details_ref TEXT,

    lease_owner TEXT,
    lease_expires_at TEXT,
    heartbeat_at TEXT,

    submitted_at TEXT,
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY(job_id) REFERENCES generation_jobs(id) ON DELETE CASCADE,
    UNIQUE(job_id, attempt_no)
);

CREATE INDEX idx_generation_attempts_active
ON generation_attempts(status, lease_expires_at, created_at);

CREATE INDEX idx_generation_attempts_provider_task
ON generation_attempts(executor_id, provider_task_id);
```

## 21.5 `generation_attempt_events`

保存关键执行事件，不保存每次轮询的全部原始响应。

```sql
CREATE TABLE generation_attempt_events (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    stage TEXT,
    summary TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY(attempt_id) REFERENCES generation_attempts(id) ON DELETE CASCADE,
    UNIQUE(attempt_id, sequence)
);
```

## 21.6 `generation_outputs`

```sql
CREATE TABLE generation_outputs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    status TEXT NOT NULL,
    kind TEXT NOT NULL,

    source_type TEXT NOT NULL,
    source_ref TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    checksum TEXT,

    asset_id TEXT,
    asset_version_id TEXT,
    disposition TEXT NOT NULL DEFAULT 'normal',
    error_json TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',

    discovered_at TEXT NOT NULL,
    ready_at TEXT,

    FOREIGN KEY(job_id) REFERENCES generation_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY(attempt_id) REFERENCES generation_attempts(id) ON DELETE CASCADE,
    UNIQUE(attempt_id, ordinal)
);

CREATE INDEX idx_generation_outputs_job
ON generation_outputs(job_id, status, ordinal);
```

## 21.7 `generation_cost_records`

```sql
CREATE TABLE generation_cost_records (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    provider_id TEXT,
    currency TEXT,
    estimated_amount REAL,
    actual_amount REAL,
    unit_summary TEXT,
    raw_usage_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY(job_id) REFERENCES generation_jobs(id),
    FOREIGN KEY(attempt_id) REFERENCES generation_attempts(id)
);
```

P0 允许 Provider 无法提供实际费用，此时字段为空。

---

## 22. Event Contract

进入统一 `/ws/v2/events` 和 Event Replay。

事件类型：

```text
generation.job.created
generation.job.queued
generation.job.status_changed
generation.job.progress
generation.job.cancel_requested
generation.job.cancelled
generation.job.succeeded
generation.job.partially_succeeded
generation.job.failed
generation.job.interrupted

generation.attempt.created
generation.attempt.started
generation.attempt.status_changed
generation.attempt.fallback_started
generation.attempt.completed

generation.output.discovered
generation.output.ready
generation.output.invalid
generation.output.late_result_recovered
```

进度事件需要节流：

- 普通进度最多每 500ms 或变化超过 1% 发布一次。
- Provider 没有真实进度时，不伪造精确百分比。
- 可以只发布 Stage 和不确定状态。

示例：

```json
{
  "type": "generation.job.status_changed",
  "aggregate_type": "generation_job",
  "aggregate_id": "job_1",
  "project_id": "prj_1",
  "payload": {
    "status": "waiting_external",
    "stage": "awaiting_provider",
    "active_attempt_id": "gat_1",
    "progress": null
  }
}
```

---

## 23. API 详细范围

## 23.1 Job API

```text
GET  /api/v2/generation-jobs
POST /api/v2/generation-jobs
GET  /api/v2/generation-jobs/{job_id}
POST /api/v2/generation-jobs/{job_id}/cancel
POST /api/v2/generation-jobs/{job_id}/retry
GET  /api/v2/generation-jobs/{job_id}/attempts
GET  /api/v2/generation-jobs/{job_id}/outputs
GET  /api/v2/generation-jobs/{job_id}/timeline
```

## 23.2 Attempt API

普通用户主要从 Job Detail 查看 Attempt，不直接创建 Attempt。

```text
GET  /api/v2/generation-attempts/{attempt_id}
GET  /api/v2/generation-attempts/{attempt_id}/technical-details
POST /api/v2/generation-attempts/{attempt_id}/recover
```

`recover` 仅管理和诊断场景使用。

## 23.3 Executor API

```text
GET  /api/v2/generation-executors
GET  /api/v2/generation-executors/{executor_id}
POST /api/v2/generation-executors/{executor_id}/probe
POST /api/v2/generation-executors:match
```

Match 请求用于 Node Inspector 显示兼容执行器和不兼容原因。

## 23.4 Result Adoption

迟到或未绑定结果可以手动采用：

```text
POST /api/v2/generation-outputs/{output_id}/adopt
```

可选参数：

```text
bind_to_node
target_collection_id
set_primary
```

---

## 24. Detail DTO

```python
class GenerationJobDetail(BaseModel):
    id: str
    project_id: str
    canvas_id: str | None
    node_id: str | None
    kind: GenerationJobKind
    operation: GenerationOperation
    title: str

    status: GenerationJobStatus
    stage: str | None
    progress: float | None
    queue_reason: str | None

    input_snapshot: GenerationInputSnapshotSummary
    execution_policy: GenerationExecutionPolicy
    output_policy: GenerationOutputPolicy

    active_attempt: GenerationAttemptSummary | None
    attempts: list[GenerationAttemptSummary]
    outputs: list[GenerationOutputSummary]
    error: GenerationError | None
    warnings: list[GenerationWarning]

    revision: int
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
```

列表页只返回 Summary，不返回完整 Snapshot 和 Attempt Timeline。

---

## 25. Recovery 与服务重启

启动时扫描：

```text
preparing
running
waiting_external
finalizing
cancel_requested
```

且 Lease 过期的 Attempt。

## 25.1 支持 Recovery

如果 Adapter 支持 `recovery` 且存在 Provider Handle：

```text
Claim Attempt
→ Adapter.recover
→ 查询上游状态
→ 恢复 polling / collecting / finalizing
```

## 25.2 不支持 Recovery

本地同步请求或已丢失进程：

- Attempt → interrupted。
- Job → interrupted。
- 保留输入 Snapshot。
- 允许 Retry。

## 25.3 上游任务未知

如果无法确定上游是否仍在运行：

- 不自动重复提交可能付费的同一请求。
- Job 标记 interrupted。
- UI 提供“查询上游”或“创建新 Attempt”选项。
- 必须显示可能产生重复费用的提示。

---

## 26. 安全与资源隔离

### 26.1 临时工作目录

```text
data/studio-v2/generation-workspaces/{attempt_id}/
```

完成后按保留策略清理。

### 26.2 Secret

- Attempt Snapshot 不保存 API Key、Cookie、Wallet Key。
- Executor Snapshot 只保存 Secret Reference。
- 日志对 Token、签名和认证 Header 脱敏。

### 26.3 Remote URL

下载结果和输入时：

- 防 SSRF。
- 域名和重定向校验。
- Content Length 限制。
- 超时。
- 文件头校验。

### 26.4 本地路径

Adapter 只能访问受控工作目录、Blob Store 和注册的 Storage Root。

---

## 27. 日志与技术详情

主 UI 展示：

- 状态。
- Stage。
- 用户可读摘要。
- Attempt 切换。
- 错误和重试建议。

技术详情保存：

```text
data/studio-v2/generation-logs/{attempt_id}/
├── stdout.log
├── stderr.log
├── request-summary.json
├── response-summary.json
└── diagnostics.json
```

数据库只保存路径、Checksum、大小和摘要。

不得在日志保存未脱敏 Secret 或完整用户认证文件。

---

## 28. 前端交互

## 28.1 Task Shelf

Job 卡片显示：

```text
标题
Operation
Executor / Model
状态和 Stage
真实进度或不确定进度
输出缩略图
取消 / 重试 / 查看详情
```

## 28.2 Job Detail

Tab：

```text
Overview
Inputs
Attempts
Outputs
Timeline
Cost
Diagnostics
```

### Attempts

显示：

```text
Attempt 1：RunningHub，失败
Attempt 2：ComfyUI，成功
```

每个 Attempt 展示 Executor、开始结束时间、阶段、错误和 Fallback 原因。

## 28.3 Partially Succeeded

必须明确显示：

```text
期望 4 个结果，成功 3 个
```

并提供：

```text
补生成缺失结果
采用现有结果
```

## 28.4 Cancel Requested

用户点击取消后立即显示 `cancel_requested`，不等待上游响应。

## 28.5 Late Result

取消后结果到达时显示非打扰提示：

```text
取消后的任务返回了 1 个结果，已归档，可查看或采用。
```

---

## 29. 后端模块结构

```text
app/
├── api/v2/
│   ├── generation_jobs.py
│   ├── generation_attempts.py
│   └── generation_executors.py
├── generation/
│   ├── models.py
│   ├── schemas.py
│   ├── service.py
│   ├── dispatcher.py
│   ├── worker.py
│   ├── scheduler.py
│   ├── executor_registry.py
│   ├── input_snapshot_service.py
│   ├── output_writer.py
│   ├── recovery_service.py
│   ├── cost_service.py
│   ├── event_mapper.py
│   └── adapters/
│       ├── base.py
│       ├── legacy_function.py
│       ├── openai_image.py
│       ├── modelscope.py
│       ├── codex_image_skill.py
│       ├── midjourney.py
│       ├── comfyui.py
│       ├── runninghub.py
│       ├── jimeng.py
│       ├── video_provider.py
│       └── asset_transform.py
└── repositories/
    ├── generation_job_repository.py
    ├── generation_attempt_repository.py
    └── generation_output_repository.py
```

现有 `main.py` 路由不需要先迁移；P0 Adapter 可以调用已有函数，随后逐步把共用实现抽到独立 Service。

---

## 30. P0 实施顺序

### 阶段 A：数据和状态机

- Generation 表和 Alembic Migration。
- Job / Attempt Repository。
- Input Snapshot。
- 状态转换校验。
- Event Outbox。

### 阶段 B：Executor Registry 和 Dispatcher

- Executor Definition。
- Provider 配置归一化。
- Queue、Claim、Lease、Heartbeat。
- 并发限制。

### 阶段 C：首批 Adapter

建议顺序：

1. `legacy_function` 通用图片 Adapter。
2. Codex Image Skill Adapter。
3. ComfyUI Adapter。
4. RunningHub Adapter。
5. 通用 Video Adapter。
6. 即梦 Adapter。
7. Midjourney Adapter。

### 阶段 D：Output Writer

- Blob 写入。
- Asset / AssetVersion。
- Preview。
- Provenance。
- Node Binding。

### 阶段 E：控制与恢复

- Cancel。
- Retry。
- Fallback。
- Timeout。
- Restart Recovery。
- Late Result。

### 阶段 F：前端闭环

- Task Shelf。
- Job Detail。
- Attempt Timeline。
- Output Adoption。
- Diagnostics。

---

## 31. 测试要求

## 31.1 状态机测试

覆盖：

- 正常成功。
- 同步成功。
- 异步轮询成功。
- Provider 临时错误自动 Fallback。
- 非可重试错误不 Fallback。
- 部分成功。
- queued 取消。
- running 取消。
- 不支持取消。
- finalizing 取消。
- 服务重启 Recovery。
- 服务重启 Interrupted。
- 迟到结果。

## 31.2 Adapter Contract Test

每个 Adapter 必须通过统一测试套件：

```text
probe
validate
prepare
submit
poll / collect
cancel
recover
error mapping
output discovery
secret redaction
```

## 31.3 Idempotency Test

- 同 Idempotency-Key 重复创建不重复付费提交。
- 网络超时后安全重试。
- Output Writer 重入不重复创建 Asset。
- Provider Callback 重复到达不重复归档。

## 31.4 Recovery Test

- Worker 在 submit 前崩溃。
- submit 成功但数据库未记录 Provider Task ID。
- Provider Task ID 已记录后崩溃。
- 正在下载结果时崩溃。
- 已写 Blob、未创建 Asset 时崩溃。
- 已创建 Asset、未更新 Job 时崩溃。

每个步骤必须可以通过幂等记录或唯一约束恢复。

---

## 32. 验收标准

完成 P0 后必须满足：

1. 新前端只使用 `/api/v2/generation-jobs` 即可提交图片、视频和 Workflow 任务。
2. 前端不理解 RunningHub、ComfyUI、即梦或 Midjourney 的原始状态枚举。
3. 每个 Job 固定 Input Snapshot，运行中输入不会漂移。
4. Retry 和 Fallback 都创建新 Attempt，不覆盖历史。
5. Worker 重启后不会无条件重复提交付费任务。
6. 支持取消时执行真实取消；不支持时明确显示限制。
7. 取消后的迟到结果不会静默丢失或自动覆盖当前节点。
8. 所有有效结果通过 Output Writer 创建 Asset / AssetVersion 和 Provenance。
9. 一次多候选输出创建多个 Asset，而不是多个 Version。
10. Job、Attempt、Output 和事件状态可以通过 SQLite 恢复。
11. Provider Secret 不进入 Job、Attempt、事件和普通日志。
12. Task Shelf 可以统一展示不同供应商和 Runtime 的生成任务。

---

## 33. 后续设计衔接

GenerationJob 完成后，下一步应详细设计：

1. Studio Event Outbox Publisher、事件持久化、聚合、限流和重连。
2. Project Bible、Script、Character、Scene、Shot、Storyboard 领域模型。
3. Agent Tool `generation.submit` 与 Permission / Budget Policy。
4. 首批影视创作 Skill 的结构化输出和 Artifact Apply。
5. Task Shelf、Job Detail 和 Agent / Generation 统一活动流原型。
