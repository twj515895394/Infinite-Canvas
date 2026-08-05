# Infinite-Canvas Studio V2 Event Hub、Outbox、Replay 与实时通信详细设计

> 文档状态：字段级详细设计基线（Implementation Contract Baseline）  
> 版本：v1.0  
> 日期：2026-08-05  
> 适用仓库：`twj515895394/Infinite-Canvas`  
> 前置文档：  
> - `docs/adr-001-studio-v2-greenfield-frontend-and-additive-backend.md`  
> - `docs/studio-v2-api-v2-p0-contract-and-openapi-design.md`  
> - `docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md`  
> - `docs/studio-v2-asset-artifact-version-reference-and-provenance-design.md`  
> - `docs/studio-v2-generation-job-state-machine-executor-and-adapter-design.md`

---

## 1. 文档目的

本文将 Studio V2 的实时状态通知、事务事件、WebSocket、REST Replay、断线恢复、流式消息、进度限流和慢消费者处理推进到可直接实现数据库、Pydantic DTO、Connection Manager、Publisher 和前端 Event Client 的字段级设计。

本文重点解决：

1. AgentTask、GenerationJob、Permission、Canvas、Asset、Artifact 和项目领域对象如何共用一套事件协议。
2. 数据库状态改变后，如何保证对应事件不会因进程崩溃而永久丢失。
3. WebSocket 断线、浏览器休眠、页面刷新和服务重启后，客户端如何恢复状态。
4. 全局 Sequence、Project Filter 和 Aggregate Filter 如何共同工作。
5. Replay 与实时推送之间如何避免连接瞬间产生竞态和漏事件。
6. Agent Message Delta、Generation Progress 等高频数据如何限流、合并和降级。
7. 慢消费者、网络拥塞和大量后台任务如何避免拖垮主进程。
8. 事件保留、压缩和 Replay Gap 如何处理。
9. 前端如何把事件安全映射到 TanStack Query、Zustand、Task Shelf 和 Agent Timeline。
10. 如何保留现有 `/ws/stats`，同时建设独立 `/ws/v2/events`，避免破坏旧前端。

Event Hub 是通知与同步基础设施，不是新的业务数据库，也不是跨服务消息队列产品。

---

## 2. 现状与问题

当前后端使用一个进程内 `ConnectionManager` 管理 `/ws/stats` 连接，并直接广播：

```text
stats
new_image
canvas_updated
asset_library_updated
pong
```

当前实现适合旧前端在线人数和简单页面刷新提示，但不具备：

- 持久化事件。
- 全局 Sequence。
- Event ID 去重。
- 项目级订阅。
- Aggregate 级订阅。
- 断线补拉。
- Replay Gap 检测。
- Agent Message、Plan、Tool Call 和 Permission。
- GenerationJob 的 Attempt、Progress 和 Output。
- 慢消费者隔离。
- 消息流限流与合并。
- 状态修改与事件写入的事务一致性。

Studio V2 不修改旧 `/ws/stats` Contract，而是新增：

```text
WS  /ws/v2/events
GET /api/v2/events
GET /api/v2/events/snapshot
```

旧 WebSocket 和新 Event Hub 使用独立 Connection Manager。

---

## 3. 核心设计原则

### 3.1 业务状态是事实，事件是通知

数据库中的 Project、Canvas、Job、Task、Permission、Asset 和 Artifact 是权威状态。

事件用于：

- 告诉客户端发生了什么。
- 驱动列表和详情刷新。
- 展示任务时间线。
- 支持断线后的增量同步。

事件不得成为唯一业务事实。

例如：

```text
收到 generation.job.succeeded
```

前端可以立即更新卡片摘要，但需要完整 Output、Attempt 或 Provenance 时仍调用 Detail API。

### 3.2 状态与 Outbox 同事务

业务状态变化与 `studio_event_outbox` 写入必须在同一个 SQLite 事务完成：

```text
更新 GenerationJob
创建 GenerationOutput
写入 Event Outbox
COMMIT
```

禁止：

```text
先 COMMIT 状态
再尝试 WebSocket 广播
```

否则进程在两步之间崩溃时会永久丢事件。

### 3.3 持久事件至少一次投递

P0 采用 At-Least-Once：

- 事件可能重复。
- 事件不能因发布失败永久丢失。
- 客户端必须按 `event_id` 和 `sequence` 去重。

不承诺 Exactly-Once WebSocket 投递。

### 3.4 全局 Sequence 只用于排序和游标

`sequence` 是全局单调递增游标。

它不要求连续：

- Project Filter 会跳过其他项目事件。
- Event Filter 会跳过不匹配事件。
- 历史 Progress Event 可能被压缩。

客户端不得用 `sequence + 1` 判断是否丢事件。

### 3.5 高频瞬态数据与持久事件分离

Event Hub 分为两个 Lane：

```text
Durable Event Lane
Transient Frame Lane
```

Durable Event：

- 有全局 Sequence。
- 写入 SQLite。
- 可以 REST Replay。
- 用于状态变化和审计时间线。

Transient Frame：

- 不写 SQLite。
- 不参与 REST Replay。
- 可以被合并、丢弃或降级。
- 用于 Agent 文本增量、细粒度进度和临时流状态。

断线后，客户端通过最终 Durable Message、Job 状态和 Detail API 恢复，不要求恢复每一个 Token 动画。

### 3.6 事件 Payload 保持轻量

事件不发送：

- 图片 Base64。
- 完整大 Prompt。
- 完整 Artifact JSON。
- 完整 stdout / stderr。
- Provider Raw Response。
- API Key、Cookie、Token。
- 本机敏感绝对路径。

大内容通过 Resource Reference 或 Detail API 获取。

### 3.7 终态事件不得被合并或丢弃

以下事件必须持久化并立即发布：

```text
*.created
*.succeeded
*.partially_succeeded
*.failed
*.cancelled
*.interrupted
permission.requested
permission.resolved
artifact.created
artifact.applied
```

Progress、Delta 和 Heartbeat 可以限流或合并。

---

## 4. 总体架构

```text
┌──────────────────────────────────────────────────────────┐
│ Domain Service                                           │
│ Canvas / Generation / Agent / Permission / Asset         │
└──────────────────────────┬───────────────────────────────┘
                           │ same SQLite transaction
                           ▼
┌──────────────────────────────────────────────────────────┐
│ Domain Tables + studio_event_outbox                      │
│ sequence / event_id / aggregate / payload / publish info │
└──────────────────────────┬───────────────────────────────┘
                           │ claim unpublished rows
                           ▼
┌──────────────────────────────────────────────────────────┐
│ EventOutboxPublisher                                     │
│ validate → serialize → dispatch → mark published         │
└───────────────────┬───────────────────────┬──────────────┘
                    │                       │
                    ▼                       ▼
       EventConnectionManager        Event Metrics / Logs
       per-connection queue
                    │
                    ▼
          WS /ws/v2/events
                    │
                    ▼
┌──────────────────────────────────────────────────────────┐
│ Studio V2 Event Client                                   │
│ Replay / Dedup / Checkpoint / Query Invalidation         │
└──────────────────────────────────────────────────────────┘

REST Replay 直接查询已提交的 studio_event_outbox：

GET /api/v2/events?after_sequence=...
```

P0 不要求引入 Kafka、RabbitMQ、Redis Streams 或外部 Broker。

未来服务拆分后，可在不修改公共 Event Contract 的前提下，将 Publisher 输出适配到外部 Broker。

---

## 5. Event Envelope

## 5.1 Durable Event

```python
class StudioEvent(BaseModel):
    event_id: str
    sequence: int
    timestamp: datetime
    schema_version: int = 1

    project_id: str | None = None
    aggregate_type: str
    aggregate_id: str
    type: str

    correlation_id: str | None = None
    causation_id: str | None = None
    actor: EventActor | None = None

    payload: JsonObject = {}
    payload_ref: ResourceLocator | None = None
```

### EventActor

```python
class EventActor(BaseModel):
    type: Literal[
        "user",
        "agent",
        "system",
        "worker",
        "provider",
    ]
    id: str | None = None
    display_name: str | None = None
```

Actor 不包含认证凭证和完整用户隐私信息。

### ResourceLocator

```python
class ResourceLocator(BaseModel):
    resource_type: str
    resource_id: str
    version_id: str | None = None
    endpoint: str | None = None
```

## 5.2 Transient Frame

```python
class StudioTransientFrame(BaseModel):
    frame_id: str
    delivery: Literal["transient"] = "transient"
    timestamp: datetime
    type: str

    project_id: str | None = None
    aggregate_type: str
    aggregate_id: str

    stream_id: str
    offset: int
    payload: JsonObject
```

Transient Frame 没有 Durable Sequence。

典型类型：

```text
agent.message.delta
generation.progress.preview
stream.typing
stream.presence
```

P0 暂不建设多人 Presence，但协议预留 Transient Lane。

## 5.3 Control Frame

WebSocket 控制帧不写 Event Outbox：

```text
stream.ready
stream.heartbeat
stream.checkpoint
stream.slow_consumer
stream.reset_required
stream.error
pong
```

---

## 6. Event 命名和 Schema 版本

### 6.1 命名规则

使用：

```text
<domain>.<aggregate>.<past-tense-action>
```

例如：

```text
generation.job.created
generation.job.progressed
generation.job.succeeded
agent.task.created
agent.permission.requested
asset.version.created
artifact.application.completed
canvas.operation.applied
```

状态事件使用已经发生的动作，不使用命令式名称：

```text
正确：generation.job.cancel_requested
错误：generation.job.cancel
```

### 6.2 Schema Version

每个 Event Type 独立维护 Payload Schema。

规则：

- 新增可选字段：保持 `schema_version`。
- 删除字段、改变语义或类型：增加 `schema_version`。
- 完全不同语义：新增 Event Type。
- 前端至少兼容当前版本和上一个版本。

建议目录：

```text
backend/events/schemas/
├── generation.py
├── agent.py
├── asset.py
├── artifact.py
├── canvas.py
└── project.py
```

禁止把未经校验的任意 Provider Raw JSON 作为公共事件 Payload。

---

## 7. P0 Durable Event Catalog

### 7.1 Project

```text
project.created
project.updated
project.archived
project.restored
```

### 7.2 Canvas

```text
canvas.created
canvas.updated
canvas.operation.applied
canvas.snapshot.created
canvas.archived
```

Canvas 拖动过程中不产生事件；只有 Operation Batch 成功提交后产生 `canvas.operation.applied`。

### 7.3 Asset 与 Artifact

```text
asset.created
asset.updated
asset.version.created
asset.trashed
asset.restored
asset.purged
asset.annotation.created

artifact.created
artifact.updated
artifact.version.created
artifact.review_status.changed
artifact.application.started
artifact.application.completed
artifact.application.failed
```

### 7.4 Generation

```text
generation.job.created
generation.job.status_changed
generation.job.progressed
generation.attempt.created
generation.attempt.status_changed
generation.output.created
generation.job.succeeded
generation.job.partially_succeeded
generation.job.failed
generation.job.cancel_requested
generation.job.cancelled
generation.job.interrupted
```

### 7.5 Agent 与 Skill

```text
agent.runtime.probed
agent.runtime.status_changed
agent.profile.created
agent.profile.updated
agent.session.created
agent.session.status_changed
agent.task.created
agent.task.status_changed
agent.run.started
agent.run.completed
agent.message.created
agent.plan.updated
agent.step.started
agent.step.completed
agent.tool_call.proposed
agent.tool_call.started
agent.tool_call.completed
agent.permission.requested
agent.permission.resolved
agent.input.requested
agent.artifact.created

skill.discovered
skill.validated
skill.version.activated
skill.status_changed
```

### 7.6 Permission

```text
permission.requested
permission.resolved
permission.grant.created
permission.grant.revoked
```

Agent 专用 Permission 事件可以保留 Agent 前缀；公共 Permissions 页面消费通用 Permission 事件。

---

## 8. Payload 设计规则

### 8.1 只发送变更摘要

示例：

```json
{
  "event_id": "evt_01",
  "sequence": 1205,
  "timestamp": "2026-08-05T14:00:00Z",
  "schema_version": 1,
  "project_id": "prj_01",
  "aggregate_type": "generation_job",
  "aggregate_id": "job_01",
  "type": "generation.job.progressed",
  "payload": {
    "status": "running",
    "stage": "awaiting_provider",
    "progress": 0.45,
    "message": "正在生成第 2 张图片",
    "revision": 8
  }
}
```

### 8.2 Revision

资源型事件建议包含最新 `revision`：

```json
{
  "revision": 12,
  "changed_fields": ["name", "tags"]
}
```

前端可以：

- 当前缓存 Revision 恰好落后时应用轻量 Patch。
- Revision 不确定时 Invalidate Query。

### 8.3 Error 摘要

失败事件只包含用户可读摘要：

```json
{
  "error": {
    "code": "PROVIDER_TIMEOUT",
    "message": "生成服务响应超时。",
    "retryable": true,
    "technical_details_available": true
  }
}
```

技术细节通过受权限保护的 Detail API 获取。

### 8.4 Changed Resource Refs

批量操作使用引用摘要：

```json
{
  "created_refs": [
    {"resource_type": "shot", "resource_id": "shot_1"}
  ],
  "updated_refs": [],
  "deleted_refs": []
}
```

大批量结果只发送数量和 `payload_ref`。

---

## 9. SQLite Event Store 与 Outbox

已有 `studio_event_outbox` 继续作为：

```text
事务 Outbox
+
P0 Durable Event Store
+
REST Replay Source
```

建议扩展后的表：

```sql
CREATE TABLE studio_event_outbox (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,

    schema_version INTEGER NOT NULL DEFAULT 1,
    project_id TEXT,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,

    correlation_id TEXT,
    causation_id TEXT,
    actor_json TEXT NOT NULL DEFAULT '{}',

    payload_json TEXT NOT NULL DEFAULT '{}',
    payload_ref_json TEXT,
    payload_checksum TEXT,

    priority INTEGER NOT NULL DEFAULT 50,
    compact_key TEXT,
    expires_at_ms INTEGER,

    publish_status TEXT NOT NULL DEFAULT 'pending',
    publish_attempts INTEGER NOT NULL DEFAULT 0,
    publisher_owner TEXT,
    publisher_lease_expires_at_ms INTEGER,
    last_publish_error TEXT,
    published_at_ms INTEGER,

    created_at_ms INTEGER NOT NULL
);

CREATE INDEX ix_event_outbox_publish
ON studio_event_outbox(
    publish_status,
    publisher_lease_expires_at_ms,
    sequence
);

CREATE INDEX ix_event_outbox_project_sequence
ON studio_event_outbox(project_id, sequence);

CREATE INDEX ix_event_outbox_aggregate_sequence
ON studio_event_outbox(aggregate_type, aggregate_id, sequence);

CREATE INDEX ix_event_outbox_type_sequence
ON studio_event_outbox(event_type, sequence);
```

`publish_status`：

```text
pending
publishing
published
retry_wait
dead_letter
```

### 9.1 Stream State

```sql
CREATE TABLE studio_event_stream_state (
    stream_name TEXT PRIMARY KEY,
    replay_floor_sequence INTEGER NOT NULL DEFAULT 0,
    last_compacted_at_ms INTEGER,
    last_published_sequence INTEGER NOT NULL DEFAULT 0,
    updated_at_ms INTEGER NOT NULL
);
```

P0 只有：

```text
global
```

`replay_floor_sequence` 表示低于或等于该值的事件不再保证可 Replay。

### 9.2 数据不变量

1. `event_id` 全局唯一。
2. Sequence 只由 SQLite 分配。
3. Event 创建后 Payload 不可原地修改。
4. 发布状态可以改变，但业务内容不可改变。
5. 业务事务回滚时 Event 同时回滚。
6. Dead Letter 不删除原始事件。
7. Replay 读取所有已提交 Durable Event，不依赖 `published_at_ms`。

---

## 10. Outbox Publisher

## 10.1 Publisher 循环

建议默认：

```text
active poll interval：50ms
idle poll interval：250ms
batch size：100
publisher lease：15s
publish retry base：500ms
publish retry max：30s
```

这些值可配置，不进入公共 API。

### 10.2 Claim

```text
BEGIN IMMEDIATE
→ 选择 pending / retry_wait 且 Lease 可用的最小 Sequence 批次
→ 标记 publishing
→ 写 publisher_owner 和 lease_expires_at
→ COMMIT
```

事务外：

```text
读取并校验事件
→ 交给 EventConnectionManager
→ 写 Metrics
```

成功后短事务：

```text
publish_status = published
published_at_ms = now
last_published_sequence = max(sequence)
```

### 10.3 崩溃窗口

如果事件已经发送，但 Publisher 在标记 `published` 前崩溃：

- Lease 到期后事件会再次发布。
- 客户端按 Event ID / Sequence 去重。

这是 At-Least-Once 的预期行为。

### 10.4 发布失败

网络或连接管理失败：

```text
publishing
→ retry_wait
```

使用指数退避。

结构或 Schema 错误原则上应在写 Outbox 前被拒绝。

若历史错误事件连续失败超过阈值：

```text
publish_status = dead_letter
```

同时记录告警，不阻塞后续 Sequence 的发布。

Dead Letter 仍可通过管理接口查看和人工重放。

### 10.5 无在线连接

没有在线 WebSocket 时，事件仍可直接标记 Published。

原因：

- 事件已经持久化。
- 后续客户端通过 Replay 获取。
- Published 表示 Publisher 已完成本次实时分发职责，不表示某个客户端确认收到。

---

## 11. WebSocket Contract

Endpoint：

```text
WS /ws/v2/events
```

Query：

```text
after_sequence: integer，可选，默认 0
project_id: string，可选
client_id: string，必填
```

P0 一个连接最多订阅：

- 全局可见事件；或
- 一个 Project。

后续可以通过 `stream.subscribe` 支持多 Project。

### 11.1 建立连接

服务端流程：

```text
验证连接身份和 Project 权限
→ 创建 ConnectionSession
→ 进入 catching_up
→ 注册实时 Buffer
→ 读取 current_sequence 高水位
→ Replay (after_sequence, high_watermark]
→ 发送 Buffered Live Events
→ 切换 live
```

先注册 Buffer 再 Replay，避免 Replay 与实时发布之间出现漏事件窗口。

### 11.2 stream.ready

```json
{
  "type": "stream.ready",
  "timestamp": "2026-08-05T14:00:00Z",
  "payload": {
    "connection_id": "conn_01",
    "current_sequence": 1200,
    "oldest_available_sequence": 500,
    "replay_floor_sequence": 499,
    "heartbeat_interval_seconds": 20,
    "max_queue_events": 500,
    "delivery": "at-least-once"
  }
}
```

### 11.3 stream.checkpoint

即使当前 Filter 没有匹配事件，服务端也定期发送：

```json
{
  "type": "stream.checkpoint",
  "timestamp": "2026-08-05T14:00:10Z",
  "payload": {
    "scanned_through_sequence": 1250
  }
}
```

客户端保存的是 `scanned_through_sequence`，而不只是最后一个匹配事件 Sequence。

这可以避免一个只订阅 Project A 的客户端，因为 Project B 大量事件而反复扫描相同范围。

### 11.4 Heartbeat

服务端每 20 秒发送：

```json
{
  "type": "stream.heartbeat",
  "timestamp": "2026-08-05T14:00:20Z",
  "payload": {
    "current_sequence": 1250
  }
}
```

客户端可以发送：

```json
{"type": "ping"}
```

响应：

```json
{
  "type": "pong",
  "timestamp": "2026-08-05T14:00:21Z"
}
```

### 11.5 Ack

客户端每 2 秒或每处理 50 个 Durable Event 发送：

```json
{
  "type": "stream.ack",
  "sequence": 1240
}
```

Ack 用于：

- 观测客户端延迟。
- 慢消费者判断。
- 连接诊断。

P0 不根据 Ack 删除事件，也不持久化每个浏览器的服务端消费位点。

### 11.6 动态订阅

P1 支持：

```json
{
  "type": "stream.subscribe",
  "subscription": {
    "project_ids": ["prj_1", "prj_2"],
    "aggregate_types": ["generation_job", "agent_task"],
    "event_types": []
  }
}
```

更新订阅后服务端返回新的 Subscription Fingerprint 和 Checkpoint。

---

## 12. Replay API

```text
GET /api/v2/events
```

Query：

```text
after_sequence: integer，必填
limit: integer，默认 500，最大 1000
project_id: string，可选
aggregate_type: string，可选
aggregate_id: string，可选
event_type: string，可选
```

响应：

```python
class EventReplayResponse(BaseModel):
    events: list[StudioEvent]
    scanned_through_sequence: int
    current_sequence: int
    oldest_available_sequence: int
    has_more: bool
```

`scanned_through_sequence` 是服务端已经扫描到的位置，不一定等于最后一个返回事件的 Sequence。

### 12.1 Filter

Filter 在服务端查询完成。

客户端不得：

- 拉取全部全局事件后自行过滤敏感 Project。
- 依赖前端过滤实现权限隔离。

### 12.2 Replay Gap

当：

```text
after_sequence < replay_floor_sequence
```

返回：

```text
409 EVENT_REPLAY_GAP
```

Problem Context：

```json
{
  "requested_after_sequence": 100,
  "replay_floor_sequence": 499,
  "oldest_available_sequence": 500,
  "current_sequence": 1250,
  "recommended_action": "fetch_sync_snapshot"
}
```

### 12.3 Sequence Ahead

客户端 Sequence 大于服务端当前 Sequence 时返回：

```text
409 EVENT_SEQUENCE_AHEAD
```

常见于：

- 数据库被恢复到旧备份。
- 客户端连接到了不同实例。
- 本地缓存来自另一个环境。

客户端必须清除当前环境的 Event Cursor 并执行 Snapshot Sync。

---

## 13. Sync Snapshot

Replay Gap 时不要求前端逐个猜测应该刷新什么。

Endpoint：

```text
GET /api/v2/events/snapshot?project_id={optional}
```

响应：

```python
class EventSyncSnapshot(BaseModel):
    current_sequence: int
    generated_at: datetime

    project: RevisionRef | None = None
    active_canvases: list[RevisionRef] = []
    active_generation_jobs: list[GenerationJobSummary] = []
    active_agent_tasks: list[AgentTaskSummary] = []
    pending_permissions: list[PermissionRequestSummary] = []
    recently_changed_assets: list[RevisionRef] = []
    recently_changed_artifacts: list[RevisionRef] = []
```

Snapshot 不是全量 Project 数据导出。

前端流程：

```text
收到 EVENT_REPLAY_GAP
→ 获取 Event Sync Snapshot
→ 更新活动任务和权限
→ Invalidate 对应 Query
→ 将 Cursor 设置为 current_sequence
→ 重连 WebSocket
```

Canvas Document、完整 Asset 和 Artifact 仍通过各自 Detail API 拉取。

---

## 14. Connection Manager

建议模块：

```text
backend/events/
├── models.py
├── registry.py
├── outbox_repository.py
├── publisher.py
├── connection_manager.py
├── replay_service.py
├── snapshot_service.py
├── throttler.py
├── serializer.py
└── metrics.py
```

### 14.1 ConnectionSession

```python
class ConnectionSession:
    connection_id: str
    client_id: str
    principal: Principal
    subscription: EventSubscription
    state: Literal["catching_up", "live", "closing"]

    durable_queue: asyncio.Queue
    transient_queue: asyncio.Queue
    replay_buffer: list[StudioEvent]

    connected_at: datetime
    last_sent_sequence: int
    last_acked_sequence: int
    last_ack_at: datetime
    last_pong_at: datetime
```

### 14.2 每连接独立发送协程

Publisher 不直接等待每个 WebSocket 的 `send_json`。

流程：

```text
Publisher
→ enqueue(event)
→ 返回

Connection Sender Task
→ 从 Queue 取出
→ send_json
```

一个慢连接不能阻塞其他连接和 Publisher。

### 14.3 Queue 限制

建议默认：

```text
Durable Queue：500 个 Event 或 2MB
Transient Queue：200 个 Frame 或 1MB
Replay Buffer：1000 个 Event
```

按照先达到的限制处理。

---

## 15. 慢消费者策略

处理顺序：

1. 合并相同 `compact_key` 的 Transient Progress。
2. 丢弃旧的 Transient Frame。
3. 保留最新 Message Delta 和 Progress Preview。
4. Durable Queue 超限时不静默丢弃 Durable Event。
5. 发送 `stream.slow_consumer`。
6. 关闭连接，客户端从最后 Ack Sequence 执行 Replay。

控制帧：

```json
{
  "type": "stream.slow_consumer",
  "payload": {
    "last_acked_sequence": 1200,
    "last_sent_sequence": 1500,
    "recommended_action": "reconnect_and_replay"
  }
}
```

建议 WebSocket Close Code：

```text
4408
```

含义：客户端消费速度不足，需要 Replay。

---

## 16. 高频事件限流与合并

### 16.1 Generation Progress

Durable `generation.job.progressed` 写入条件：

```text
Stage 改变
或 Progress 增加至少 0.01
或距离上一条 Durable Progress 超过 1 秒
或 Message 语义显著改变
```

终态立即写入，不受限流影响。

细粒度进度可以作为 Transient：

```text
generation.progress.preview
```

### 16.2 Agent Message Delta

Runtime Token 不逐 Token 发送。

建议合并条件：

```text
50ms
或累计 1KB
或遇到换行 / 句子边界
```

通过：

```text
agent.message.delta
```

发送 Transient Frame。

消息完成后写入 Durable：

```text
agent.message.created
```

并包含完整 Message ID、摘要和 Resource Reference。

### 16.3 Agent Plan

Plan 高频修订按 `run_id` 合并，最多每 500ms 产生一条 Durable `agent.plan.updated`。

### 16.4 Asset Ingest

批量导入 Progress：

```text
每 500ms
或完成数量增加 5%
或失败数量改变
```

### 16.5 Canvas

禁止把鼠标移动、拖拽中位置和选择状态写入 Event Hub。

只发布服务端成功提交的 Operation Batch。

### 16.6 Runtime Health

只有以下情况发布 Durable Event：

- ready → degraded。
- degraded → unavailable。
- unavailable → ready。
- Capability 集合发生变化。

每次 Probe 详情保存到 Probe 表，不全部广播。

---

## 17. Event Compact Key

用于 Transient 合并和部分 Durable Progress 压缩：

```text
progress:generation_job:{job_id}
message-delta:{message_id}
plan:{run_id}
asset-ingest:{job_id}
runtime-health:{runtime_id}
```

终态 Event 不设置可覆盖 Compact Key。

Publisher 不能用 Compact Key 覆盖已经持久化的终态事件。

---

## 18. Event 保留和压缩

建议默认：

```text
EVENT_RETENTION_DAYS = 7
EVENT_MIN_RETAINED_ROWS = 100000
EVENT_MAX_RETAINED_ROWS = 1000000
PROGRESS_COMPACTION_AFTER_HOURS = 24
```

保留策略：

1. 业务状态仍保存在领域表，Event 不负责长期权威审计。
2. 最近 24 小时保留完整 Durable Progress。
3. 超过 24 小时的高频 Progress 可以只保留阶段变化和最后一条。
4. Created、Permission、Terminal、Artifact Apply 等关键事件保留到统一 Retention Floor。
5. 清理完成后更新 `replay_floor_sequence`。
6. 超过最大行数时优先压缩 Progress，再推进 Retention Floor。

Sequence 不需要连续，因此删除中间 Progress 不影响排序游标。

### 18.1 清理事务

Compactor 使用小批次删除，避免长时间占用 SQLite 写锁：

```text
每批 1000 条
短事务
批次间 Yield
```

### 18.2 Event 不是审计日志替代品

权限审批、Agent Tool Call、Generation Attempt、Artifact Application 和 Provenance 仍保存在各自领域表。

Event 被清理后，重要历史事实仍可查询。

---

## 19. 安全与权限

### 19.1 连接授权

P0 即使暂时沿用本地单用户模式，也必须保留 `Principal` 抽象。

连接时校验：

- 当前用户是否能访问 Project。
- 是否能查看技术诊断事件。
- 是否能查看全局 Runtime 和管理事件。

`client_id` 不是身份凭证。

### 19.2 Payload 脱敏

禁止 Event Payload 包含：

```text
API Key
Access Token
Cookie
Provider Secret
完整 Auth File
敏感绝对路径
未经处理的 Provider Raw Error
```

### 19.3 过滤是服务端权限边界

用户没有权限的 Project 事件不得先发送再由前端隐藏。

### 19.4 Diagnostic Event

技术诊断 Event 使用独立权限：

```text
events.diagnostics.read
```

普通创作者只看到用户可读状态和错误摘要。

---

## 20. 前端 Event Client

建议目录：

```text
src/core/events/
├── event-client.ts
├── event-types.ts
├── event-schemas.ts
├── event-router.ts
├── replay-client.ts
├── cursor-store.ts
├── connection-store.ts
└── handlers/
    ├── generation.ts
    ├── agent.ts
    ├── permission.ts
    ├── canvas.ts
    ├── asset.ts
    └── artifact.ts
```

### 20.1 Cursor Store

Cursor 按环境和 Subscription Fingerprint 保存：

```text
api-origin
user-id
project-id / global
subscription fingerprint
```

建议使用 IndexedDB；localStorage 只保存轻量连接偏好。

### 20.2 去重

客户端维护：

- `last_scanned_sequence`。
- 最近 Event ID 的有限 LRU Set。

收到重复 Event：

```text
忽略业务处理
但允许更新连接指标
```

### 20.3 Zod 校验

Durable Event 和关键 Payload 必须经过 Zod 校验。

未知 Event Type：

- 记录 Debug 日志。
- 更新 Checkpoint。
- 不让整个连接失败。

已知 Type 但 Payload 无效：

- 不应用 Patch。
- Invalidate 对应 Aggregate Query。
- 上报客户端协议错误。

### 20.4 TanStack Query 映射

事件处理优先级：

```text
轻量且 Revision 可确认
→ setQueryData Patch

结构复杂或 Revision 不确定
→ invalidateQueries
```

例如：

```text
generation.job.progressed
→ Patch Job Summary

asset.version.created
→ Invalidate Asset Detail + Asset Grid

canvas.operation.applied
→ 当前编辑器由 Canvas Operation Channel 已处理时去重
→ 其他页面 Invalidate Canvas Summary
```

### 20.5 Zustand

以下状态进入 Zustand：

- WebSocket 连接状态。
- 当前 Transient Message Delta。
- 临时 Generation Progress Preview。
- 未读 Permission 提示。
- Task Shelf 展开状态。

服务端资源事实不复制成长期 Zustand 权威状态。

### 20.6 多 Tab

P0 允许每个 Tab 独立连接。

后续可用 BroadcastChannel 选举一个 Leader Tab 共享事件，减少连接数，但不作为 P0 前置条件。

---

## 21. 连接与恢复时序

### 21.1 正常连接

```text
Frontend 读取 Cursor = 1000
→ WS Connect after_sequence=1000
→ Server 注册 catching_up Buffer
→ Server High Watermark = 1050
→ Replay 1001..1050 中匹配事件
→ Flush Replay 期间产生的 Live Buffer
→ stream.ready / checkpoint
→ Live
```

### 21.2 短暂断线

```text
最后 Checkpoint = 1200
→ 网络断开
→ 指数退避重连
→ after_sequence=1200
→ Replay
→ Live
```

前端建议退避：

```text
0.5s, 1s, 2s, 5s, 10s, 30s
```

网络恢复或页面重新获得可见性时可以提前重试。

### 21.3 Replay Gap

```text
Cursor = 100
Replay Floor = 499
→ stream.reset_required / 409 EVENT_REPLAY_GAP
→ GET /api/v2/events/snapshot
→ Invalidate Queries
→ Cursor = snapshot.current_sequence
→ Reconnect
```

### 21.4 慢消费者

```text
Durable Queue 超限
→ stream.slow_consumer
→ Close 4408
→ 从 last_acked_sequence Replay
```

### 21.5 服务数据库回滚

```text
Client Cursor > Server Current Sequence
→ EVENT_SEQUENCE_AHEAD
→ 清除该环境 Cursor
→ Snapshot Sync
→ Reconnect
```

---

## 22. API DTO

### 22.1 Replay

```python
class EventReplayQuery(BaseModel):
    after_sequence: int = Field(ge=0)
    limit: int = Field(default=500, ge=1, le=1000)
    project_id: str | None = None
    aggregate_type: str | None = None
    aggregate_id: str | None = None
    event_type: str | None = None

class EventReplayResponse(BaseModel):
    events: list[StudioEvent]
    scanned_through_sequence: int
    current_sequence: int
    oldest_available_sequence: int
    has_more: bool
```

### 22.2 Stream Health

管理接口：

```text
GET /api/v2/admin/event-stream/health
```

响应：

```python
class EventStreamHealth(BaseModel):
    current_sequence: int
    replay_floor_sequence: int
    pending_publish_count: int
    retry_wait_count: int
    dead_letter_count: int
    connection_count: int
    slow_connection_count: int
    publisher_running: bool
    last_published_at: datetime | None
    last_compacted_at: datetime | None
```

### 22.3 Dead Letter

P1 管理接口：

```text
GET  /api/v2/admin/event-stream/dead-letters
POST /api/v2/admin/event-stream/dead-letters/{event_id}/retry
```

---

## 23. 观测指标

建议指标：

```text
event_outbox_pending_total
event_outbox_publish_latency_ms
event_outbox_publish_failures_total
event_outbox_dead_letter_total
event_stream_connections
event_stream_replay_events_total
event_stream_replay_gap_total
event_stream_connection_queue_size
event_stream_slow_consumer_total
event_stream_transient_dropped_total
event_stream_ack_lag
```

日志必须包含：

```text
connection_id
client_id
project_id
sequence
event_id
event_type
correlation_id
```

不得记录完整敏感 Payload。

---

## 24. 测试设计

### 24.1 Outbox 事务

- 业务事务回滚时 Event 不存在。
- 业务事务成功时 Event 必然存在。
- 状态与 Event Sequence 同时可查询。

### 24.2 Publisher

- 正常批量发布。
- 发布后标记 Published。
- 发送成功、标记前崩溃产生重复，客户端正确去重。
- Lease 过期后另一 Publisher 接管。
- Dead Letter 不阻塞后续事件。

### 24.3 Replay

- 无 Filter 顺序正确。
- Project Filter 返回正确事件。
- `scanned_through_sequence` 正确推进。
- Replay Gap 返回 409。
- Sequence Ahead 返回 409。
- Compaction 后 Replay 游标仍正确。

### 24.4 连接竞态

测试 Replay 期间同时插入新事件，确保：

- 不漏事件。
- 不乱序。
- 允许重复但可去重。

### 24.5 慢消费者

- Transient 优先丢弃。
- Durable Event 不静默丢失。
- Queue 超限发送 Slow Consumer 并关闭。
- 客户端 Replay 后恢复。

### 24.6 高频流

- Token 合并符合时间和大小窗口。
- Job Progress 限流。
- Terminal Event 不被延迟。
- Message 完成后 Durable Message 可恢复。

### 24.7 前端

- 重复 Event 不重复更新。
- 未知 Event Type 不导致连接崩溃。
- 无效 Payload 触发 Query Invalidation。
- 页面刷新后从 Cursor 恢复。
- Replay Gap 执行 Snapshot Sync。

---

## 25. 后端实施结构

```text
backend/
├── api_v2/
│   ├── events.py
│   └── event_admin.py
├── events/
│   ├── models.py
│   ├── schemas.py
│   ├── registry.py
│   ├── service.py
│   ├── outbox_repository.py
│   ├── publisher.py
│   ├── connection_manager.py
│   ├── replay_service.py
│   ├── snapshot_service.py
│   ├── throttler.py
│   ├── compactor.py
│   └── metrics.py
└── repositories/
    └── event_repository.py
```

旧 `ConnectionManager` 保留在 Legacy 模块，不作为新 Event Hub 的基类。

---

## 26. 实施顺序

### 阶段 A：Durable Event 基础

1. 扩展 `studio_event_outbox` Migration。
2. 建立 Event Schema Registry。
3. 建立 Event Service 和事务写入 Helper。
4. 接入 GenerationJob、AgentTask 和 Permission 的关键状态事件。
5. 实现 Replay API。

### 阶段 B：Publisher 与 WebSocket

1. EventOutboxPublisher。
2. 新 EventConnectionManager。
3. ConnectionSession 和独立 Sender Task。
4. Catch-up Buffer。
5. Heartbeat、Checkpoint 和 Ack。
6. Slow Consumer。

### 阶段 C：Transient Lane

1. Agent Message Delta 合并。
2. Generation Progress Preview。
3. Transient Queue 和 Compact Key。
4. 丢弃和降级指标。

### 阶段 D：恢复与运维

1. Sync Snapshot。
2. Retention 和 Compactor。
3. Health API。
4. Dead Letter 管理。
5. Metrics 和告警。

### 阶段 E：前端 Event Client

1. WebSocket Client。
2. Replay Client。
3. Cursor Store。
4. Zod Event Registry。
5. TanStack Query Handlers。
6. Zustand Transient Store。
7. Task Shelf、Agent Dock 和 Permission Center 接入。

---

## 27. P0 验收标准

满足以下条件才算 Event Hub P0 完成：

1. GenerationJob、AgentTask 和 Permission 状态变化与 Event Outbox 同事务。
2. 服务重启不会丢失已提交但尚未实时发布的 Durable Event。
3. WebSocket 断线后可以使用 Sequence Replay 恢复。
4. Replay 与实时连接切换期间不会漏事件。
5. Project Filter 在服务端执行。
6. 客户端可以安全处理重复 Event。
7. Replay Gap 有明确 Snapshot Sync 流程。
8. Agent Token 不逐 Token 写 SQLite。
9. Job Progress 经过限流，终态立即发送。
10. 慢连接不会阻塞 Publisher 或其他连接。
11. Durable Queue 超限时不会静默丢弃业务事件。
12. Event Payload 不包含 Secret、Base64 或 Provider Raw Response。
13. Event 保留与 Compaction 不破坏领域历史数据。
14. 前端页面刷新后可以恢复活动 Job、Agent Task 和 Pending Permission。
15. 旧 `/ws/stats` 和旧前端行为不受影响。

---

## 28. 后续设计依赖

Event Hub 完成后，下一阶段进入 AI 影视创作核心领域模型：

```text
Project Bible
Script / ScriptVersion
Character / CharacterVersion
Scene / SceneVersion
Prop
Shot
StoryboardFrame
Continuity
Domain Tool Contract
```

这些领域对象的修改、Artifact Apply、Agent Tool Call 和批量写入都统一使用本文定义的 Event、Revision、Outbox 和 Replay 基础设施。
