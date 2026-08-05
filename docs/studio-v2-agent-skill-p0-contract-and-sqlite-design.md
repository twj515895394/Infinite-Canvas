# Infinite-Canvas Studio V2 Agent / Skill P0 Contract、SQLite 与 Runtime Adapter 详细设计

> 文档状态：字段级详细设计基线（Implementation Contract Baseline）  
> 版本：v1.0  
> 日期：2026-08-05  
> 适用仓库：`twj515895394/Infinite-Canvas`  
> 前置文档：  
> - `docs/adr-001-studio-v2-greenfield-frontend-and-additive-backend.md`  
> - `docs/studio-v2-agent-skill-runtime-and-management-design.md`  
> - `docs/studio-v2-api-v2-p0-contract-and-openapi-design.md`

---

## 1. 文档目的

本文将 Agent、Skill、Runtime、Session、Task、Run、Context、Tool 和 Permission 从总体设计推进到可以直接开始后端编码、生成 OpenAPI 和前端类型的字段级 Contract。

本文重点确定：

1. Agent P0 使用哪些 SQLite 表、字段、约束和索引。
2. 哪些内容放数据库，哪些内容放文件系统。
3. Pydantic 请求和响应 DTO 的稳定字段。
4. P0 必须实现的 `/api/v2` 接口及错误语义。
5. Runtime Adapter 的统一内部协议。
6. Task 从提交到完成、等待权限、取消、重试和重启恢复的完整时序。
7. Skill 安装、发现、版本固定和原子切换规则。
8. 事件 Outbox、幂等、并发租约和审计边界。

本文不是 Runtime 本身的 Agent Harness 设计。Codex、Claude、Gemini、Pi 或其他 Runtime 的内部推理循环仍由外部 Runtime 负责。

---

## 2. P0 范围

P0 必须能够完成以下闭环：

```text
配置一个 Runtime
→ 创建一个 Agent Profile
→ 发现或安装一个 Skill
→ 将 Skill 绑定到 Agent
→ 创建 Session
→ 预览 Context
→ 提交 Agent Task
→ 创建 Run
→ 流式展示状态与消息
→ 处理 Tool Call / Permission
→ 生成 Artifact 或文本结果
→ 支持取消、失败和重试
→ 服务重启后保留任务历史并恢复可恢复任务
```

P0 不要求：

- 通用 Multi-Agent 编排。
- 自动 Agent 团队组建。
- 复杂 DAG 调度。
- Runtime Marketplace。
- 远程多租户执行集群。
- 跨机器进程迁移。
- 完整 Git Skill 自动升级。
- 任意代码 Skill 的无条件执行。

---

## 3. 正式技术决策

### 3.1 数据库

Agent P0 元数据与运行状态使用 SQLite：

```text
data/studio-v2/studio.db
```

建议实现技术：

- SQLAlchemy 2.x 风格 ORM / Core。
- Alembic 管理 Schema Migration。
- Repository 层隔离 SQLAlchemy 与业务服务。
- FastAPI Router 不直接执行 SQL。

如果第一阶段暂不引入 SQLAlchemy，也必须保持本文表结构与 Repository 接口，不允许将业务重新退化为散落 JSON 文件。

### 3.2 SQLite 连接参数

启动时设置：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

要求：

- 写事务尽量短。
- 不在数据库事务中等待 Runtime、网络或子进程。
- 一个 Service 方法只在需要原子一致性时开启事务。
- 后台 Dispatcher 与 API 请求共享同一个 Repository 抽象，但不共享同一个连接对象。

### 3.3 ID

API 和数据库 ID 使用带类型前缀的 UUIDv4 字符串：

```text
rtp_<uuid>   Runtime Profile
agt_<uuid>   Agent Profile
afr_<uuid>   Agent Profile Revision
skl_<uuid>   Skill
skv_<uuid>   Skill Version
ses_<uuid>   Agent Session
tsk_<uuid>   Agent Task
run_<uuid>   Agent Run
stp_<uuid>   Agent Step
msg_<uuid>   Agent Message
ctx_<uuid>   Context Snapshot
tcl_<uuid>   Tool Call
prq_<uuid>   Permission Request
pgr_<uuid>   Permission Grant
evt_<uuid>   Studio Event
```

不依赖自增 ID 作为公共标识。

### 3.4 时间

数据库内部统一保存 Unix Epoch 毫秒：

```text
INTEGER created_at_ms
```

API 输出统一转换为 ISO 8601 UTC：

```text
2026-08-05T09:00:00.000Z
```

### 3.5 JSON 字段

SQLite 中复杂配置使用 `TEXT` 保存规范化 JSON：

- UTF-8。
- Key 排序后计算 checksum。
- 不依赖 SQLite JSON1 扩展作为正确性前提。
- 高频查询字段必须拆成独立列，不能只藏在 JSON 中。

### 3.6 Revision

可编辑配置对象使用整数 Revision：

```text
agent_runtime_profiles.revision
agent_profiles.current_revision
agent_sessions.revision
agent_tasks.revision
```

更新请求携带 `base_revision`。冲突返回：

```text
409 REVISION_CONFLICT
```

---

## 4. 数据与文件的存储边界

### 4.1 放入 SQLite

必须进入数据库：

- Runtime Profile 和 Probe 结果。
- Agent Profile 和 Profile Revision。
- Skill 身份、安装、版本索引和验证结果。
- Agent 与 Skill 绑定。
- Session、Task、Run、Step、Message。
- Context Snapshot 元数据与引用。
- Tool Call、Permission Request、Permission Grant。
- Idempotency Record。
- Studio Event Outbox。

### 4.2 放入文件系统

适合进入文件系统：

- Skill Package 原始文件。
- 大型 Context Render 文件。
- Runtime stdout / stderr 分段日志。
- 大型 Tool Result。
- 大型 Artifact 内容。
- Runtime Workspace。
- 临时上传和附件。

### 4.3 目录结构

```text
data/studio-v2/
├── studio.db
├── skills/
│   ├── installed/
│   │   └── {skill-key}/{version}/
│   ├── staging/
│   └── quarantine/
├── projects/
│   └── {project-id}/skills/
├── agent-workspaces/
│   └── {session-id}/
├── context-snapshots/
│   └── {snapshot-id}/
│       ├── manifest.json
│       ├── context.md
│       └── attachments/
├── task-logs/
│   └── {run-id}/
│       ├── stdout.log
│       ├── stderr.log
│       └── runtime-events.jsonl
└── tool-results/
    └── {tool-call-id}/
```

内置 Skill 建议随代码发布：

```text
app/agent/builtin_skills/
```

内置 Skill 视为只读来源，不能直接在运行目录中修改。

---

## 5. SQLite 表总览

P0 表：

```text
agent_runtime_profiles
agent_runtime_probes
agent_profiles
agent_profile_revisions
skills
skill_installations
skill_versions
agent_skill_bindings
agent_sessions
agent_tasks
agent_runs
agent_steps
agent_messages
context_snapshots
context_references
tool_calls
permission_requests
permission_grants
idempotency_records
studio_event_outbox
```

Artifact 主表将在 Artifact 专项设计中定义。Agent P0 只通过 `artifact_id` 和 Resource Reference 关联，不在 Agent 模块重复建立 Artifact 内容表。

---

## 6. SQLite DDL 基线

以下 DDL 是逻辑基线。实际 Alembic Migration 可以按数据库方言和 ORM 约束调整，但字段语义不得改变。

### 6.1 Runtime Profile

```sql
CREATE TABLE agent_runtime_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    adapter_type TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    executable_path TEXT,
    endpoint_url TEXT,
    default_model TEXT,
    command_template_json TEXT NOT NULL DEFAULT '{}',
    config_json TEXT NOT NULL DEFAULT '{}',
    environment_refs_json TEXT NOT NULL DEFAULT '{}',
    workspace_policy_json TEXT NOT NULL DEFAULT '{}',
    capability_snapshot_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'unknown',
    last_probe_at_ms INTEGER,
    last_probe_error_json TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    deleted_at_ms INTEGER
);

CREATE UNIQUE INDEX ux_runtime_profile_name_active
ON agent_runtime_profiles(name)
WHERE deleted_at_ms IS NULL;

CREATE INDEX ix_runtime_profile_enabled
ON agent_runtime_profiles(enabled, deleted_at_ms);
```

`adapter_type`：

```text
acp
cli-jsonl
cli-stdio
http
embedded-tool
```

`status`：

```text
unknown
probing
ready
unavailable
auth-required
incompatible
disabled
```

### 6.2 Runtime Probe History

```sql
CREATE TABLE agent_runtime_probes (
    id TEXT PRIMARY KEY,
    runtime_profile_id TEXT NOT NULL,
    status TEXT NOT NULL,
    version TEXT,
    authenticated INTEGER,
    capabilities_json TEXT NOT NULL DEFAULT '[]',
    models_json TEXT NOT NULL DEFAULT '[]',
    native_skills_json TEXT NOT NULL DEFAULT '[]',
    diagnostics_json TEXT NOT NULL DEFAULT '{}',
    error_json TEXT,
    started_at_ms INTEGER NOT NULL,
    finished_at_ms INTEGER,
    FOREIGN KEY(runtime_profile_id) REFERENCES agent_runtime_profiles(id)
);

CREATE INDEX ix_runtime_probe_profile_time
ON agent_runtime_probes(runtime_profile_id, started_at_ms DESC);
```

### 6.3 Agent Profile 与 Revision

```sql
CREATE TABLE agent_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    runtime_profile_id TEXT NOT NULL,
    default_model TEXT,
    current_revision INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft',
    created_by TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    deleted_at_ms INTEGER,
    FOREIGN KEY(runtime_profile_id) REFERENCES agent_runtime_profiles(id)
);

CREATE UNIQUE INDEX ux_agent_slug_active
ON agent_profiles(slug)
WHERE deleted_at_ms IS NULL;

CREATE INDEX ix_agent_runtime
ON agent_profiles(runtime_profile_id, enabled, deleted_at_ms);

CREATE TABLE agent_profile_revisions (
    id TEXT PRIMARY KEY,
    agent_profile_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    instructions_text TEXT NOT NULL DEFAULT '',
    runtime_config_json TEXT NOT NULL DEFAULT '{}',
    context_policy_json TEXT NOT NULL DEFAULT '{}',
    tool_policy_json TEXT NOT NULL DEFAULT '{}',
    permission_policy_json TEXT NOT NULL DEFAULT '{}',
    output_policy_json TEXT NOT NULL DEFAULT '{}',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    checksum TEXT NOT NULL,
    created_by TEXT,
    created_at_ms INTEGER NOT NULL,
    FOREIGN KEY(agent_profile_id) REFERENCES agent_profiles(id),
    UNIQUE(agent_profile_id, revision)
);
```

更新 Agent Profile 时：

1. 校验 `base_revision`。
2. 创建新的 `agent_profile_revisions`。
3. 更新 `agent_profiles.current_revision`。
4. 同一事务写入 Event Outbox。

历史 Run 固定保存使用的 `agent_profile_revision`，不随 Profile 更新而变化。

### 6.4 Skill、Installation 与 Version

```sql
CREATE TABLE skills (
    id TEXT PRIMARY KEY,
    skill_key TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'discovered',
    active_version_id TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    deleted_at_ms INTEGER
);

CREATE UNIQUE INDEX ux_skill_key_active
ON skills(skill_key)
WHERE deleted_at_ms IS NULL;

CREATE TABLE skill_installations (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_uri TEXT,
    project_id TEXT,
    root_path TEXT NOT NULL,
    read_only INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 100,
    status TEXT NOT NULL DEFAULT 'ready',
    discovered_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    FOREIGN KEY(skill_id) REFERENCES skills(id)
);

CREATE INDEX ix_skill_installation_lookup
ON skill_installations(skill_id, project_id, priority);

CREATE TABLE skill_versions (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    version TEXT NOT NULL,
    manifest_json TEXT NOT NULL,
    input_schema_json TEXT NOT NULL DEFAULT '{}',
    output_schema_json TEXT NOT NULL DEFAULT '{}',
    required_capabilities_json TEXT NOT NULL DEFAULT '[]',
    required_tools_json TEXT NOT NULL DEFAULT '[]',
    permission_requirements_json TEXT NOT NULL DEFAULT '[]',
    native_bindings_json TEXT NOT NULL DEFAULT '{}',
    execution_mode TEXT NOT NULL,
    artifact_type TEXT,
    package_checksum TEXT NOT NULL,
    validation_status TEXT NOT NULL DEFAULT 'pending',
    validation_result_json TEXT NOT NULL DEFAULT '{}',
    installed_at_ms INTEGER NOT NULL,
    validated_at_ms INTEGER,
    FOREIGN KEY(skill_id) REFERENCES skills(id),
    FOREIGN KEY(installation_id) REFERENCES skill_installations(id),
    UNIQUE(installation_id, version)
);

CREATE INDEX ix_skill_version_skill
ON skill_versions(skill_id, version);
```

`source_type`：

```text
builtin
local
project
git
runtime-native
imported
```

`validation_status`：

```text
pending
validating
ready
incompatible
broken
```

### 6.5 Agent Skill Binding

```sql
CREATE TABLE agent_skill_bindings (
    id TEXT PRIMARY KEY,
    agent_profile_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    version_constraint TEXT NOT NULL DEFAULT '*',
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 100,
    aliases_json TEXT NOT NULL DEFAULT '[]',
    default_inputs_json TEXT NOT NULL DEFAULT '{}',
    runtime_overrides_json TEXT NOT NULL DEFAULT '{}',
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    FOREIGN KEY(agent_profile_id) REFERENCES agent_profiles(id),
    FOREIGN KEY(skill_id) REFERENCES skills(id),
    UNIQUE(agent_profile_id, skill_id)
);

CREATE INDEX ix_agent_skill_order
ON agent_skill_bindings(agent_profile_id, enabled, priority);
```

Task 创建时解析实际 `skill_version_id`。历史 Run 不保存版本范围，而保存实际版本。

### 6.6 Agent Session

```sql
CREATE TABLE agent_sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    agent_profile_id TEXT NOT NULL,
    agent_profile_revision INTEGER NOT NULL,
    runtime_profile_id TEXT NOT NULL,
    runtime_session_id TEXT,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'creating',
    workspace_json TEXT NOT NULL DEFAULT '{}',
    context_policy_json TEXT NOT NULL DEFAULT '{}',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    revision INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    last_activity_at_ms INTEGER NOT NULL,
    closed_at_ms INTEGER,
    error_json TEXT,
    FOREIGN KEY(agent_profile_id) REFERENCES agent_profiles(id),
    FOREIGN KEY(runtime_profile_id) REFERENCES agent_runtime_profiles(id)
);

CREATE INDEX ix_agent_session_project_status
ON agent_sessions(project_id, status, last_activity_at_ms DESC);

CREATE INDEX ix_agent_session_profile
ON agent_sessions(agent_profile_id, last_activity_at_ms DESC);
```

Session 状态：

```text
creating
ready
running
waiting_input
waiting_permission
closing
closed
failed
```

### 6.7 Agent Task

```sql
CREATE TABLE agent_tasks (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    project_id TEXT,
    agent_profile_id TEXT NOT NULL,
    requested_skill_id TEXT,
    requested_skill_version_constraint TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    active_run_id TEXT,
    context_request_json TEXT NOT NULL DEFAULT '{}',
    output_policy_json TEXT NOT NULL DEFAULT '{}',
    permission_policy_json TEXT NOT NULL DEFAULT '{}',
    source_json TEXT NOT NULL DEFAULT '{}',
    idempotency_key TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    finished_at_ms INTEGER,
    error_json TEXT,
    FOREIGN KEY(session_id) REFERENCES agent_sessions(id),
    FOREIGN KEY(agent_profile_id) REFERENCES agent_profiles(id)
);

CREATE INDEX ix_agent_task_session_time
ON agent_tasks(session_id, created_at_ms DESC);

CREATE INDEX ix_agent_task_project_status
ON agent_tasks(project_id, status, updated_at_ms DESC);

CREATE UNIQUE INDEX ux_agent_task_idempotency
ON agent_tasks(session_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;
```

Task 状态：

```text
draft
queued
preparing
running
waiting_permission
waiting_input
succeeded
failed
cancel_requested
cancelled
```

### 6.8 Agent Run

```sql
CREATE TABLE agent_runs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    runtime_profile_id TEXT NOT NULL,
    runtime_session_id TEXT,
    runtime_task_id TEXT,
    agent_profile_revision INTEGER NOT NULL,
    resolved_skill_versions_json TEXT NOT NULL DEFAULT '[]',
    context_snapshot_id TEXT,
    retry_mode TEXT NOT NULL DEFAULT 'original-context',
    lease_owner TEXT,
    lease_expires_at_ms INTEGER,
    heartbeat_at_ms INTEGER,
    stdout_ref TEXT,
    stderr_ref TEXT,
    runtime_event_log_ref TEXT,
    result_summary TEXT,
    result_json TEXT,
    error_json TEXT,
    exit_code INTEGER,
    created_at_ms INTEGER NOT NULL,
    started_at_ms INTEGER,
    finished_at_ms INTEGER,
    FOREIGN KEY(task_id) REFERENCES agent_tasks(id),
    FOREIGN KEY(runtime_profile_id) REFERENCES agent_runtime_profiles(id),
    FOREIGN KEY(context_snapshot_id) REFERENCES context_snapshots(id),
    UNIQUE(task_id, attempt)
);

CREATE INDEX ix_agent_run_dispatch
ON agent_runs(status, lease_expires_at_ms, created_at_ms);

CREATE INDEX ix_agent_run_task
ON agent_runs(task_id, attempt DESC);
```

Run 状态比 Task 多一个恢复语义：

```text
queued
preparing
running
waiting_permission
waiting_input
succeeded
failed
cancel_requested
cancelled
interrupted
```

`interrupted` 表示进程或服务中断导致当前 Run 无法确认继续执行。Task 可保持 `failed` 或根据 Runtime Capability 创建恢复 Run。

### 6.9 Step 与 Message

```sql
CREATE TABLE agent_steps (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT,
    summary TEXT,
    payload_json TEXT,
    resource_ref TEXT,
    started_at_ms INTEGER,
    finished_at_ms INTEGER,
    error_json TEXT,
    FOREIGN KEY(run_id) REFERENCES agent_runs(id),
    UNIQUE(run_id, sequence)
);

CREATE INDEX ix_agent_step_run_sequence
ON agent_steps(run_id, sequence);

CREATE TABLE agent_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    task_id TEXT,
    run_id TEXT,
    sequence INTEGER NOT NULL,
    role TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'message',
    content TEXT,
    content_ref TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at_ms INTEGER NOT NULL,
    FOREIGN KEY(session_id) REFERENCES agent_sessions(id),
    FOREIGN KEY(task_id) REFERENCES agent_tasks(id),
    FOREIGN KEY(run_id) REFERENCES agent_runs(id)
);

CREATE INDEX ix_agent_message_session_sequence
ON agent_messages(session_id, sequence);

CREATE INDEX ix_agent_message_task
ON agent_messages(task_id, created_at_ms);
```

Step Kind：

```text
planning
status-summary
skill-start
skill-end
tool-call
permission
input-request
artifact-create
checkpoint
result
diagnostic
```

不保存或展示 Runtime 私有思维链。`reasoning-summary` 只能是 Runtime 明确提供的可展示摘要。

### 6.10 Context Snapshot

```sql
CREATE TABLE context_snapshots (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    task_id TEXT NOT NULL,
    run_id TEXT,
    policy_json TEXT NOT NULL,
    rendered_context_ref TEXT,
    manifest_ref TEXT,
    token_estimate INTEGER,
    asset_count INTEGER NOT NULL DEFAULT 0,
    checksum TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    FOREIGN KEY(task_id) REFERENCES agent_tasks(id),
    FOREIGN KEY(run_id) REFERENCES agent_runs(id)
);

CREATE INDEX ix_context_snapshot_task
ON context_snapshots(task_id, created_at_ms DESC);

CREATE TABLE context_references (
    id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL,
    reference_type TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    version_ref TEXT,
    required INTEGER NOT NULL DEFAULT 0,
    title TEXT,
    summary TEXT,
    content_checksum TEXT,
    resource_ref TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    sequence INTEGER NOT NULL,
    FOREIGN KEY(snapshot_id) REFERENCES context_snapshots(id),
    UNIQUE(snapshot_id, sequence)
);

CREATE INDEX ix_context_reference_lookup
ON context_references(reference_type, reference_id);
```

### 6.11 Tool Call

```sql
CREATE TABLE tool_calls (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    step_id TEXT,
    runtime_call_id TEXT,
    tool_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    side_effect TEXT NOT NULL,
    arguments_json TEXT,
    arguments_ref TEXT,
    arguments_checksum TEXT,
    result_summary TEXT,
    result_json TEXT,
    result_ref TEXT,
    permission_request_id TEXT,
    idempotency_key TEXT,
    started_at_ms INTEGER,
    finished_at_ms INTEGER,
    error_json TEXT,
    created_at_ms INTEGER NOT NULL,
    FOREIGN KEY(run_id) REFERENCES agent_runs(id),
    FOREIGN KEY(step_id) REFERENCES agent_steps(id)
);

CREATE INDEX ix_tool_call_run
ON tool_calls(run_id, created_at_ms);

CREATE UNIQUE INDEX ux_tool_call_runtime_id
ON tool_calls(run_id, runtime_call_id)
WHERE runtime_call_id IS NOT NULL;

CREATE UNIQUE INDEX ux_tool_call_idempotency
ON tool_calls(tool_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;
```

Tool Call 状态：

```text
proposed
waiting_permission
approved
running
succeeded
failed
denied
cancelled
```

### 6.12 Permission Request 与 Grant

```sql
CREATE TABLE permission_requests (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    tool_call_id TEXT,
    agent_profile_id TEXT NOT NULL,
    skill_id TEXT,
    project_id TEXT,
    permission_key TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_scope TEXT NOT NULL DEFAULT 'once',
    summary TEXT NOT NULL,
    impact_json TEXT NOT NULL DEFAULT '{}',
    arguments_preview_json TEXT NOT NULL DEFAULT '{}',
    reversible INTEGER NOT NULL DEFAULT 0,
    paid_action INTEGER NOT NULL DEFAULT 0,
    expires_at_ms INTEGER,
    decided_by TEXT,
    decision_comment TEXT,
    decided_at_ms INTEGER,
    created_at_ms INTEGER NOT NULL,
    FOREIGN KEY(run_id) REFERENCES agent_runs(id),
    FOREIGN KEY(tool_call_id) REFERENCES tool_calls(id)
);

CREATE INDEX ix_permission_request_pending
ON permission_requests(status, created_at_ms);

CREATE TABLE permission_grants (
    id TEXT PRIMARY KEY,
    decision TEXT NOT NULL,
    scope TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    agent_profile_id TEXT,
    skill_id TEXT,
    tool_id TEXT,
    permission_key TEXT NOT NULL,
    conditions_json TEXT NOT NULL DEFAULT '{}',
    created_by TEXT,
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER,
    revoked_at_ms INTEGER,
    revoke_reason TEXT
);

CREATE INDEX ix_permission_grant_match
ON permission_grants(scope, scope_id, permission_key, revoked_at_ms, expires_at_ms);
```

`risk_level`：

```text
low
medium
high
critical
```

`scope`：

```text
once
session
project
```

`once` 通常不持久化为通用 Grant，只用于解决当前 Request；保留记录时必须限定到 `tool_call_id`。

### 6.13 Idempotency

```sql
CREATE TABLE idempotency_records (
    namespace TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_checksum TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    response_json TEXT,
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    PRIMARY KEY(namespace, idempotency_key)
);

CREATE INDEX ix_idempotency_expiry
ON idempotency_records(expires_at_ms);
```

同一 Key 不同请求内容返回：

```text
409 IDEMPOTENCY_KEY_REUSED
```

### 6.14 Studio Event Outbox

```sql
CREATE TABLE studio_event_outbox (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    project_id TEXT,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    correlation_id TEXT,
    causation_id TEXT,
    actor_json TEXT NOT NULL DEFAULT '{}',
    payload_json TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    published_at_ms INTEGER
);

CREATE INDEX ix_event_outbox_unpublished
ON studio_event_outbox(published_at_ms, sequence);

CREATE INDEX ix_event_outbox_project_sequence
ON studio_event_outbox(project_id, sequence);
```

数据库状态变化和 Outbox 事件必须在同一事务提交。

---

## 7. 核心数据不变量

必须由 Service 和数据库约束共同保证：

1. 一个 Task 同时只能有一个 Active Run。
2. `agent_tasks.active_run_id` 必须指向该 Task 的 Run。
3. Run Attempt 从 1 连续递增，不覆盖历史 Run。
4. Succeeded、Failed、Cancelled、Interrupted Run 不再回到 Running。
5. Task 进入 Succeeded 时必须存在成功 Run。
6. Task 进入 Waiting Permission 时必须存在 Pending Permission Request。
7. Tool Call 进入 Running 前必须通过权限判断。
8. Skill Version 在 Run 创建后不可修改。
9. Agent Profile Revision 在 Run 创建后不可修改。
10. Context Snapshot 创建后不可修改，只能创建新的 Snapshot。
11. 删除 Agent Profile、Skill 或 Runtime 使用软删除，不能破坏历史 Run。
12. 任何批量领域写入必须使用 Tool Gateway，并保存 Tool Call 审计。
13. Runtime stdout 不能作为唯一业务事实，关键状态必须进入结构化表。

---

## 8. Skill Registry P0 规则

### 8.1 Discover

Discover 扫描：

```text
app/agent/builtin_skills/
data/studio-v2/skills/installed/
data/studio-v2/projects/{project-id}/skills/
Runtime Native Skill 列表
```

扫描过程：

```text
发现目录
→ 定位 skill.yaml
→ 路径安全检查
→ Manifest 解析
→ Schema 解析
→ Package Checksum
→ Runtime / Tool 兼容性检查
→ 写入或更新 Installation 与 Version 索引
→ 写入 skill.discovered / skill.validated 事件
```

### 8.2 Import

ZIP 或目录导入必须经过：

1. 上传到 `skills/staging/{operation-id}`。
2. 禁止绝对路径、`..`、逃逸路径和危险符号链接。
3. 校验单文件和总包大小。
4. 校验 `skill.yaml`。
5. 校验 Skill ID 和 Version。
6. 校验 Input / Output Schema。
7. 计算 Package Checksum。
8. 与现有版本冲突时拒绝静默覆盖。
9. 原子 Rename 到正式版本目录。
10. 数据库事务写入 Installation / Version / Outbox。

失败包移动到 `quarantine/` 或清理，不得留下半安装状态。

### 8.3 Version 激活

激活版本时：

- 校验 Version Ready。
- 更新 `skills.active_version_id`。
- 不改变历史 Run。
- 已绑定 `version_constraint` 的 Agent 在下一个 Task 创建时重新解析版本。
- 需要严格固定版本的 Agent Binding 使用精确版本约束。

### 8.4 SemVer

P0 使用 SemVer 字符串，支持：

```text
*
1.2.3
^1.2.0
~1.2.0
>=1.1.0 <2.0.0
```

解析失败返回 Skill Validation Error，不允许退化为任意版本。

### 8.5 可执行内容

P0 默认允许：

- Prompt。
- Markdown 指令。
- JSON Schema。
- Studio Tool Composition 描述。
- Runtime Native Binding。

P0 不自动执行来源不可信 Skill 中的任意脚本。

包含 `scripts/` 的 Skill：

- 必须标记执行要求。
- 必须显示来源。
- 必须通过 `process.execute` 权限。
- 必须在受控工作目录运行。
- 后续可增加签名和信任等级。

---

## 9. Pydantic DTO 基线

所有字段使用 `snake_case`。以下为核心结构，实际实现可拆分 Summary / Detail / Create / Update Model。

### 9.1 Runtime

```python
class AgentRuntimeProfileCreate(BaseModel):
    name: str
    adapter_type: Literal["acp", "cli-jsonl", "cli-stdio", "http", "embedded-tool"]
    executable_path: str | None = None
    endpoint_url: str | None = None
    default_model: str | None = None
    command_template: dict[str, Any] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)
    environment_refs: dict[str, str] = Field(default_factory=dict)
    workspace_policy: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True

class AgentRuntimeProfileUpdate(BaseModel):
    base_revision: int
    name: str | None = None
    default_model: str | None = None
    command_template: dict[str, Any] | None = None
    config: dict[str, Any] | None = None
    environment_refs: dict[str, str] | None = None
    workspace_policy: dict[str, Any] | None = None
    enabled: bool | None = None

class AgentRuntimeProfileDetail(BaseModel):
    id: str
    name: str
    adapter_type: str
    enabled: bool
    status: str
    version: str | None = None
    authenticated: bool | None = None
    default_model: str | None = None
    capabilities: list[str]
    models: list[str]
    native_skills: list[dict[str, Any]]
    revision: int
    last_probe_at: datetime | None = None
    last_probe_error: ProblemDetail | None = None
```

### 9.2 Agent Profile

```python
class AgentProfileCreate(BaseModel):
    name: str
    slug: str
    description: str = ""
    icon: str | None = None
    runtime_profile_id: str
    default_model: str | None = None
    instructions: str = ""
    runtime_config: dict[str, Any] = Field(default_factory=dict)
    context_policy: dict[str, Any] = Field(default_factory=dict)
    tool_policy: dict[str, Any] = Field(default_factory=dict)
    permission_policy: dict[str, Any] = Field(default_factory=dict)
    output_policy: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True

class AgentProfileUpdate(BaseModel):
    base_revision: int
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    icon: str | None = None
    runtime_profile_id: str | None = None
    default_model: str | None = None
    instructions: str | None = None
    runtime_config: dict[str, Any] | None = None
    context_policy: dict[str, Any] | None = None
    tool_policy: dict[str, Any] | None = None
    permission_policy: dict[str, Any] | None = None
    output_policy: dict[str, Any] | None = None
    enabled: bool | None = None

class AgentProfileDetail(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    icon: str | None
    enabled: bool
    status: str
    runtime_profile: AgentRuntimeProfileSummary
    default_model: str | None
    current_revision: int
    instructions: str
    runtime_config: dict[str, Any]
    context_policy: dict[str, Any]
    tool_policy: dict[str, Any]
    permission_policy: dict[str, Any]
    output_policy: dict[str, Any]
    skill_bindings: list[AgentSkillBindingDetail]
    validation: ValidationSummary
    created_at: datetime
    updated_at: datetime
```

### 9.3 Skill

```python
class SkillSummary(BaseModel):
    id: str
    skill_key: str
    name: str
    description: str
    category: str | None
    enabled: bool
    status: str
    active_version: str | None
    source_types: list[str]
    compatible_runtime_count: int
    binding_count: int

class SkillVersionDetail(BaseModel):
    id: str
    skill_id: str
    version: str
    source_type: str
    root_path: str
    read_only: bool
    execution_mode: str
    manifest: dict[str, Any]
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    required_capabilities: list[str]
    required_tools: list[str]
    permission_requirements: list[str]
    artifact_type: str | None
    package_checksum: str
    validation_status: str
    validation_result: ValidationResult

class SkillImportResponse(BaseModel):
    operation_id: str
    skill: SkillSummary
    version: SkillVersionDetail
    warnings: list[ValidationIssue]
```

### 9.4 Binding

```python
class AgentSkillBindingCreate(BaseModel):
    skill_id: str
    version_constraint: str = "*"
    enabled: bool = True
    priority: int = 100
    aliases: list[str] = Field(default_factory=list)
    default_inputs: dict[str, Any] = Field(default_factory=dict)
    runtime_overrides: dict[str, Any] = Field(default_factory=dict)

class AgentSkillBindingUpdate(BaseModel):
    version_constraint: str | None = None
    enabled: bool | None = None
    priority: int | None = None
    aliases: list[str] | None = None
    default_inputs: dict[str, Any] | None = None
    runtime_overrides: dict[str, Any] | None = None
```

### 9.5 Session

```python
class AgentSessionCreate(BaseModel):
    project_id: str | None = None
    agent_profile_id: str
    title: str = ""
    workspace: dict[str, Any] = Field(default_factory=dict)
    context_policy_overrides: dict[str, Any] = Field(default_factory=dict)

class AgentSessionDetail(BaseModel):
    id: str
    project_id: str | None
    agent_profile: AgentProfileSummary
    agent_profile_revision: int
    runtime_profile: AgentRuntimeProfileSummary
    runtime_session_id: str | None
    title: str
    status: str
    workspace: dict[str, Any]
    context_policy: dict[str, Any]
    revision: int
    active_task: AgentTaskSummary | None
    created_at: datetime
    updated_at: datetime
    last_activity_at: datetime
```

Session 创建只创建 Studio Session。Runtime 原生 Session 可以立即创建，也可以在首个 Task 启动时 Lazy Create。P0 建议 Lazy Create，避免创建大量空 Runtime 进程。

### 9.6 Context Preview

```python
class ContextReferenceRequest(BaseModel):
    reference_type: str
    reference_id: str
    version_ref: str | None = None
    required: bool = False

class AgentContextPreviewRequest(BaseModel):
    project_id: str | None = None
    agent_profile_id: str
    skill_id: str | None = None
    workspace: str | None = None
    selection_refs: list[ContextReferenceRequest] = Field(default_factory=list)
    attachment_asset_version_ids: list[str] = Field(default_factory=list)
    message: str = ""
    policy_overrides: dict[str, Any] = Field(default_factory=dict)

class ContextChip(BaseModel):
    key: str
    label: str
    reference_type: str
    reference_id: str
    version_ref: str | None
    required: bool
    removable: bool
    warning: str | None = None

class AgentContextPreviewResponse(BaseModel):
    resolved_agent_revision: int
    resolved_skill_versions: list[SkillVersionRef]
    chips: list[ContextChip]
    token_estimate: int | None
    asset_count: int
    warnings: list[ValidationIssue]
    missing_requirements: list[ValidationIssue]
    can_submit: bool
```

### 9.7 Task Create

```python
class AgentTaskCreate(BaseModel):
    agent_profile_id: str
    skill_id: str | None = None
    skill_version_constraint: str | None = None
    message: str = Field(min_length=1)
    context: AgentTaskContextRequest
    output_policy: AgentOutputPolicy
    permission_policy: AgentPermissionPolicy
    source: AgentTaskSource = Field(default_factory=AgentTaskSource)
    idempotency_key: str

class AgentTaskContextRequest(BaseModel):
    project_id: str | None = None
    workspace: str | None = None
    selection_refs: list[ContextReferenceRequest] = Field(default_factory=list)
    attachment_asset_version_ids: list[str] = Field(default_factory=list)
    policy_overrides: dict[str, Any] = Field(default_factory=dict)

class AgentOutputPolicy(BaseModel):
    mode: Literal["message-only", "artifact", "domain-write", "artifact-and-domain-write"]
    artifact_type: str | None = None
    require_preview_before_write: bool = True

class AgentPermissionPolicy(BaseModel):
    read: Literal["allow", "ask", "deny"] = "allow"
    write: Literal["allow", "ask", "deny"] = "ask"
    destructive: Literal["ask", "deny"] = "ask"
    generation: Literal["allow", "ask", "deny"] = "ask"
    process: Literal["ask", "deny"] = "ask"
    network: Literal["allow-declared", "ask", "deny"] = "ask"
```

### 9.8 Task / Run / Step

```python
class AgentTaskDetail(BaseModel):
    id: str
    session_id: str
    project_id: str | None
    agent_profile: AgentProfileSummary
    requested_skill: SkillSummary | None
    message: str
    status: str
    active_run_id: str | None
    output_policy: AgentOutputPolicy
    permission_policy: AgentPermissionPolicy
    source: AgentTaskSource
    revision: int
    latest_run: AgentRunSummary | None
    pending_permission_count: int
    artifact_ids: list[str]
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None
    error: ProblemDetail | None

class AgentRunDetail(BaseModel):
    id: str
    task_id: str
    attempt: int
    status: str
    runtime_profile: AgentRuntimeProfileSummary
    runtime_session_id: str | None
    runtime_task_id: str | None
    agent_profile_revision: int
    resolved_skill_versions: list[SkillVersionRef]
    context_snapshot_id: str | None
    retry_mode: str
    result_summary: str | None
    result: dict[str, Any] | None
    log_refs: dict[str, str]
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    error: ProblemDetail | None

class AgentStepDetail(BaseModel):
    id: str
    run_id: str
    sequence: int
    kind: str
    status: str
    title: str | None
    summary: str | None
    resource_ref: str | None
    started_at: datetime | None
    finished_at: datetime | None
    error: ProblemDetail | None
```

### 9.9 Permission

```python
class PermissionDecisionRequest(BaseModel):
    decision: Literal["allow", "deny"]
    scope: Literal["once", "session", "project"]
    comment: str = ""
    expected_status: Literal["pending"] = "pending"

class PermissionRequestDetail(BaseModel):
    id: str
    run_id: str
    tool_call_id: str | None
    agent: AgentProfileSummary
    skill: SkillSummary | None
    project_id: str | None
    permission_key: str
    risk_level: str
    status: str
    requested_scope: str
    summary: str
    impact: dict[str, Any]
    arguments_preview: dict[str, Any]
    reversible: bool
    paid_action: bool
    expires_at: datetime | None
    created_at: datetime
```

---

## 10. P0 API Contract

### 10.1 Runtime

```text
GET    /api/v2/agent-runtimes
POST   /api/v2/agent-runtimes
GET    /api/v2/agent-runtimes/{runtime_id}
PATCH  /api/v2/agent-runtimes/{runtime_id}
POST   /api/v2/agent-runtimes/{runtime_id}/probe
GET    /api/v2/agent-runtimes/{runtime_id}/probes
```

Probe 建议作为短任务同步等待有限时间，例如数秒；若需要登录或耗时检查，返回 Probe Resource 并通过事件更新。

错误：

```text
404 AGENT_RUNTIME_NOT_FOUND
409 REVISION_CONFLICT
409 AGENT_RUNTIME_IN_USE
422 AGENT_RUNTIME_CONFIG_INVALID
503 AGENT_RUNTIME_UNAVAILABLE
```

### 10.2 Agent Profile

```text
GET    /api/v2/agent-profiles
POST   /api/v2/agent-profiles
GET    /api/v2/agent-profiles/{agent_id}
PATCH  /api/v2/agent-profiles/{agent_id}
DELETE /api/v2/agent-profiles/{agent_id}
POST   /api/v2/agent-profiles/{agent_id}/validate
POST   /api/v2/agent-profiles/{agent_id}/duplicate
```

删除为软删除。存在历史 Task 时仍可删除配置入口，但历史 Detail 必须可以解析其 Revision Snapshot。

### 10.3 Skill

```text
GET    /api/v2/skills
POST   /api/v2/skills/discover
POST   /api/v2/skills/import
GET    /api/v2/skills/{skill_id}
PATCH  /api/v2/skills/{skill_id}
POST   /api/v2/skills/{skill_id}/validate
POST   /api/v2/skills/{skill_id}/enable
POST   /api/v2/skills/{skill_id}/disable
GET    /api/v2/skills/{skill_id}/versions
POST   /api/v2/skills/{skill_id}/versions/{version_id}/activate
```

`POST /skills/import` 使用 Multipart：

```text
file
project_id 可选
activate bool
```

错误：

```text
400 SKILL_PACKAGE_INVALID
409 SKILL_VERSION_EXISTS
409 SKILL_VERSION_IN_USE
422 SKILL_MANIFEST_INVALID
422 SKILL_SCHEMA_INVALID
422 SKILL_RUNTIME_INCOMPATIBLE
```

### 10.4 Agent Skill Binding

```text
GET    /api/v2/agent-profiles/{agent_id}/skills
POST   /api/v2/agent-profiles/{agent_id}/skills
PATCH  /api/v2/agent-profiles/{agent_id}/skills/{binding_id}
DELETE /api/v2/agent-profiles/{agent_id}/skills/{binding_id}
POST   /api/v2/agent-profiles/{agent_id}/skills:reorder
```

绑定和重排后 Agent Profile 必须生成新 Revision，保证历史 Run 可追溯。

### 10.5 Session

```text
GET    /api/v2/agent-sessions
POST   /api/v2/agent-sessions
GET    /api/v2/agent-sessions/{session_id}
PATCH  /api/v2/agent-sessions/{session_id}
POST   /api/v2/agent-sessions/{session_id}/close
GET    /api/v2/agent-sessions/{session_id}/messages
```

列表参数：

```text
project_id
agent_profile_id
status
cursor
limit
```

### 10.6 Context

```text
POST /api/v2/agent-contexts/preview
GET  /api/v2/agent-contexts/snapshots/{snapshot_id}
```

P0 不允许普通客户端直接创建可执行 Snapshot。Task Service 在 Run Preparing 阶段创建权威 Snapshot，防止客户端伪造版本引用。

### 10.7 Task

```text
GET    /api/v2/agent-tasks
POST   /api/v2/agent-sessions/{session_id}/tasks
GET    /api/v2/agent-tasks/{task_id}
POST   /api/v2/agent-tasks/{task_id}/cancel
POST   /api/v2/agent-tasks/{task_id}/retry
POST   /api/v2/agent-tasks/{task_id}/input
GET    /api/v2/agent-tasks/{task_id}/runs
GET    /api/v2/agent-runs/{run_id}
GET    /api/v2/agent-runs/{run_id}/steps
```

Task 创建事务必须同时完成：

1. 校验 Session 可用。
2. 校验 Agent 与 Runtime 可用。
3. 解析 Skill Binding 和版本。
4. 校验 Context 基本要求。
5. 写入 User Message。
6. 创建 Task。
7. 创建 Run Attempt 1。
8. 设置 `active_run_id`。
9. 写入 Idempotency Record。
10. 写入 `agent.task.created` Event Outbox。

返回状态：

```text
201 Created
```

重复相同幂等请求返回原 Task：

```text
200 OK
```

同 Key 不同请求返回 409。

### 10.8 Cancel

```json
{
  "reason": "用户取消"
}
```

Cancel 行为：

- Task 已结束：返回当前状态，不报错。
- Queued / Preparing：直接转 Cancelled。
- Running：先转 Cancel Requested，再调用 Adapter。
- Runtime 确认停止：转 Cancelled。
- Runtime 无取消能力：记录警告，后台等待进程退出或强制终止策略。

### 10.9 Retry

```json
{
  "mode": "original-context",
  "message_override": null,
  "permission_policy_override": null
}
```

Mode：

```text
original-context
latest-context
```

Retry 创建新的 Run，不创建新的 Task。

### 10.10 Input

用于 `waiting_input`：

```json
{
  "message": "使用第二个方案，镜头数量改为 10 个。",
  "attachment_asset_version_ids": []
}
```

只有 Active Run 为 Waiting Input 才接受：

```text
409 AGENT_TASK_NOT_WAITING_INPUT
```

### 10.11 Permission

```text
GET    /api/v2/permission-requests
GET    /api/v2/permission-requests/{request_id}
POST   /api/v2/permission-requests/{request_id}/decide
GET    /api/v2/permission-grants
DELETE /api/v2/permission-grants/{grant_id}
```

Decide 必须使用原子条件更新：

```sql
UPDATE permission_requests
SET status = ?, decided_at_ms = ?
WHERE id = ? AND status = 'pending';
```

未更新到一行则返回：

```text
409 PERMISSION_ALREADY_RESOLVED
```

### 10.12 Tool 查询

```text
GET /api/v2/tools
GET /api/v2/tools/{tool_id}
GET /api/v2/tool-calls
GET /api/v2/tool-calls/{tool_call_id}
```

普通 Studio 页面不直接通过该 API 执行任意 Tool。

---

## 11. Runtime Adapter 内部 Contract

### 11.1 Python 接口

```python
class AgentRuntimeAdapter(Protocol):
    async def probe(self, profile: RuntimeProfileSnapshot) -> RuntimeProbeResult: ...

    async def create_session(
        self,
        request: RuntimeSessionCreate,
    ) -> RuntimeSessionHandle: ...

    async def resume_session(
        self,
        request: RuntimeSessionResume,
    ) -> RuntimeSessionHandle: ...

    async def submit_task(
        self,
        request: RuntimeTaskSubmit,
    ) -> RuntimeTaskHandle: ...

    async def send_input(self, request: RuntimeUserInput) -> None: ...

    async def decide_permission(
        self,
        request: RuntimePermissionDecision,
    ) -> None: ...

    async def cancel_task(self, request: RuntimeTaskCancel) -> None: ...

    async def close_session(self, request: RuntimeSessionClose) -> None: ...

    def stream_events(
        self,
        handle: RuntimeTaskHandle,
    ) -> AsyncIterator[NormalizedRuntimeEvent]: ...
```

### 11.2 RuntimeTaskSubmit

```python
class RuntimeTaskSubmit(BaseModel):
    studio_session_id: str
    studio_task_id: str
    studio_run_id: str
    runtime_session_id: str | None
    agent: AgentProfileRevisionSnapshot
    skills: list[ResolvedSkillPackage]
    context: RuntimeContextPackage
    user_message: str
    output_policy: AgentOutputPolicy
    tool_bridge: RuntimeToolBridgeConfig | None
    permission_policy: AgentPermissionPolicy
    workspace_path: str
    correlation_id: str
```

### 11.3 NormalizedRuntimeEvent

所有 Adapter 必须转换为统一事件，不允许 Service 直接解析某个 Runtime 的 stdout 文本。

```python
class NormalizedRuntimeEvent(BaseModel):
    sequence: int
    event_type: Literal[
        "status",
        "message-delta",
        "message-completed",
        "plan-updated",
        "step-started",
        "step-completed",
        "tool-call-proposed",
        "tool-call-result",
        "permission-requested",
        "input-requested",
        "artifact-proposed",
        "checkpoint",
        "diagnostic",
        "completed",
        "failed",
    ]
    timestamp: datetime
    runtime_event_id: str | None = None
    payload: dict[str, Any]
```

### 11.4 Capability 降级

Adapter 必须诚实声明 Capability。

例如 CLI stdio 只提供：

```text
text-generation
streaming（如果可可靠读取）
cancellation（如果可终止进程）
```

它不能伪造：

```text
tool-calling
permission-request
session-resume
structured-output
```

如果 Runtime 不支持 Tool Calling：

- Agent 只能生成文本或 Artifact Proposal。
- 不允许执行 Domain Write。
- UI 显示 Capability 限制。

### 11.5 CLI 执行安全

使用：

```python
await asyncio.create_subprocess_exec(
    executable,
    *args,
    cwd=workspace_path,
    env=sanitized_env,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.PIPE,
)
```

禁止：

```python
create_subprocess_shell(...)
```

除非是明确受控、无需用户输入拼接的内部命令，并经过安全审查。

### 11.6 首个 Adapter 建议

首个落地建议复用现有 Codex CLI 探测和子进程 helper，新增 `CodexCliAgentAdapter`。

实现原则：

1. Probe 复用当前可执行文件检测和环境解析。
2. 具体命令参数封装在 Adapter，不扩散到 Service。
3. 若当前 CLI 可提供结构化流，解析为 Normalized Runtime Event。
4. 若只能提供文本流，降级为 `cli-stdio` 能力，不伪造 Tool Call。
5. Tool Gateway 仅在 Probe 确认 Runtime 支持对应 Bridge 时启用。
6. Codex CLI 的图片生成 helper 仍作为 Generation Adapter 使用，不等同于 Agent Skill Runtime。

之后再增加：

```text
Claude CLI / ACP Adapter
Gemini CLI Adapter
Generic JSONL Adapter
Pi / oh-my-pi Adapter
```

---

## 12. Tool Bridge

External Runtime 访问 Studio Tool Gateway 需要桥接层：

```text
Runtime
→ Runtime Tool Bridge
→ Studio Tool Gateway
→ Permission Service
→ Domain Service / Generation Service
```

P0 支持模式：

```text
in-process      用于测试或 Embedded Runtime
mcp-stdio       用于支持 MCP 的本地 Runtime
adapter-native  用于 ACP 或 Runtime 原生 Tool Call
none            Text-only Runtime
```

Tool Bridge 配置只向 Runtime 暴露当前 Agent、Skill 和项目允许的 Tool 子集。

Tool 调用流程：

1. Runtime 提交 Tool Call。
2. Adapter 转为 `tool-call-proposed`。
3. Tool Gateway 校验 Tool、Schema 和调用上下文。
4. Permission Service 匹配 Grant 和 Policy。
5. 需要审批则创建 Permission Request。
6. 审批后执行 Tool。
7. 保存 Tool Call Result。
8. 将结果返回 Runtime。
9. 写入 Studio Event。

任何 Runtime 不得通过 Tool Bridge 获得未声明的“万能后端调用”能力。

---

## 13. Task Dispatcher 与 Worker Lease

### 13.1 Dispatcher

新增后台组件：

```text
AgentTaskDispatcher
```

职责：

- 从 SQLite Claim Queued Run。
- 创建 Context Snapshot。
- 调用 Runtime Adapter。
- 消费 Normalized Runtime Event。
- 更新 Run / Task / Session。
- 执行 Tool 和 Permission 协调。
- 维护 Lease 和 Heartbeat。
- 处理 Cancel。
- 服务启动时恢复过期 Run。

### 13.2 Claim

Claim 使用短事务：

```text
BEGIN IMMEDIATE
→ 查找 status=queued 且 lease 为空或过期的 Run
→ 更新 status=preparing、lease_owner、lease_expires_at
→ COMMIT
```

即使 P0 只有单进程，也使用 Lease，避免未来加入多 Worker 时重写任务模型。

### 13.3 Lease

建议：

```text
lease duration：30 秒
heartbeat：10 秒
```

数值允许配置。

Runtime 等待用户 Permission 或 Input 时仍需要续租，防止另一个 Worker 重复接管。

### 13.4 事务边界

禁止：

```text
开启事务
→ 启动 CLI
→ 等待模型返回
→ 提交事务
```

正确方式：

```text
短事务写状态
→ 事务外调用 Runtime
→ 收到事件
→ 短事务写状态和 Outbox
```

---

## 14. 标准执行时序

### 14.1 正常 Task

```text
Frontend
  → POST /agent-sessions/{id}/tasks
Task Service
  → 创建 Task + Run + Message + Outbox
  → 立即返回 queued
Dispatcher
  → Claim Run
  → 解析 Agent Revision / Skill Versions
  → 构建 Context Snapshot
  → 确保 Runtime Session
  → submit_task
Adapter
  → stream_events
Run Service
  → 保存 Step / Message / Tool Call / Event
Runtime
  → completed
Run Service
  → Run succeeded
  → Task succeeded
  → Session ready
  → 保存 Artifact Link
  → Outbox
Frontend
  ← WebSocket Event
```

### 14.2 Permission

```text
Runtime Tool Call
→ Tool Gateway 校验
→ 未匹配 Grant
→ 创建 Permission Request
→ Tool Call waiting_permission
→ Run / Task / Session waiting_permission
→ Event: agent.permission.requested
→ 用户 Allow / Deny
→ 原子解决 Request
→ 创建 Grant（scope=session/project 时）
→ Adapter / Tool Gateway 继续或拒绝
→ Run 恢复 running
```

Permission 卡片不能因为页面切换或刷新丢失，Pending Request 必须来自数据库查询。

### 14.3 Waiting Input

```text
Runtime 请求补充信息
→ 创建 input-request Step
→ Run / Task / Session waiting_input
→ 用户 POST /agent-tasks/{id}/input
→ 保存 User Message
→ Adapter send_input
→ 状态恢复 running
```

如果 Adapter 不支持 `send_input`，则该 Capability 不可用；任务只能结束并由用户创建 Retry 或新 Task。

### 14.4 Cancel

```text
用户 Cancel
→ Task cancel_requested
→ Run cancel_requested
→ Adapter cancel_task
→ Runtime 停止
→ Run cancelled
→ Task cancelled
→ Session ready
```

若 Runtime 长时间不响应取消：

- 本地 CLI 根据策略执行 terminate，再执行 kill。
- 远程 Runtime 记录取消不确定状态和诊断。
- 不得直接把未知结果标记为成功。

### 14.5 Retry

```text
失败 Task
→ POST retry
→ 新建 Run attempt+1
→ active_run_id 指向新 Run
→ Task queued
```

`original-context`：复用原 Snapshot 或从其 Manifest 复制新 Snapshot 引用。

`latest-context`：重新执行 Context Builder，并在 UI 中显示“输入已变化”。

### 14.6 服务重启

启动恢复：

1. 查找 `preparing/running/waiting_*` 且 Lease 过期的 Run。
2. 查询 Runtime Profile Capability。
3. 支持 Session Resume 且 Runtime Handle 可确认存在：创建恢复流程。
4. 无法恢复：Run 标记 `interrupted`。
5. Task 标记 `failed`，Error Code 为 `AGENT_RUN_INTERRUPTED`，允许 Retry。
6. Pending Permission Request 保留，但如果其 Run 已 Interrupted，则标记 Cancelled。
7. 写入恢复事件和审计记录。

P0 不假装恢复不可恢复的本地 CLI 进程。

---

## 15. Studio Event 映射

Outbox 最终发布到：

```text
/ws/v2/events
GET /api/v2/events
```

P0 Agent Event：

```text
agent.runtime.created
agent.runtime.updated
agent.runtime.probed
agent.profile.created
agent.profile.updated
agent.profile.deleted
skill.discovered
skill.validated
skill.version.activated
agent.session.created
agent.session.status_changed
agent.task.created
agent.task.status_changed
agent.run.started
agent.run.status_changed
agent.message.created
agent.plan.updated
agent.step.started
agent.step.completed
agent.tool_call.proposed
agent.tool_call.status_changed
agent.permission.requested
agent.permission.resolved
agent.input.requested
agent.artifact.created
```

示例：

```json
{
  "event_id": "evt_xxx",
  "sequence": 1024,
  "timestamp": "2026-08-05T09:00:00.000Z",
  "project_id": "project-1",
  "aggregate_type": "agent_task",
  "aggregate_id": "tsk_xxx",
  "type": "agent.task.status_changed",
  "correlation_id": "tsk_xxx",
  "causation_id": "run_xxx",
  "payload": {
    "previous_status": "preparing",
    "status": "running",
    "active_run_id": "run_xxx",
    "revision": 3
  }
}
```

Message Delta 不建议每个 Token 都进入持久化 Outbox。

策略：

- WebSocket 可以合并短时间 Delta。
- 数据库按句子、时间窗口或 Message Completion 批量落盘。
- Completion 后保存最终 Message。
- 断线补拉至少能恢复完整 Message 和关键 Step，不要求恢复每个 Token Delta。

---

## 16. 幂等、并发与一致性

### 16.1 Task 创建

幂等 Namespace：

```text
agent-task-create:{session_id}
```

Request Checksum 至少包含：

- Agent Profile ID。
- Skill ID / Constraint。
- Message。
- Context Request。
- Output Policy。
- Permission Policy。

### 16.2 Tool Call

有副作用 Tool 必须具备 Idempotency Key。

建议：

```text
{run_id}:{runtime_call_id}:{tool_id}
```

Runtime 重发同一个调用时返回原结果，不重复创建镜头、素材或生成任务。

### 16.3 Profile Update

Agent Profile 和 Runtime Profile 使用 Revision CAS。

### 16.4 Permission Race

Permission Decide 使用原子条件更新，防止两个页面同时点击。

### 16.5 Task Active Run

创建 Retry 时使用事务检查当前 Task 是否已有未结束 Active Run。

错误：

```text
409 AGENT_TASK_ALREADY_RUNNING
```

---

## 17. Error Code

P0 至少定义：

```text
AGENT_RUNTIME_NOT_FOUND
AGENT_RUNTIME_UNAVAILABLE
AGENT_RUNTIME_AUTH_REQUIRED
AGENT_RUNTIME_INCOMPATIBLE
AGENT_RUNTIME_IN_USE
AGENT_PROFILE_NOT_FOUND
AGENT_PROFILE_INVALID
AGENT_PROFILE_DISABLED
SKILL_NOT_FOUND
SKILL_VERSION_NOT_FOUND
SKILL_VERSION_EXISTS
SKILL_VERSION_IN_USE
SKILL_PACKAGE_INVALID
SKILL_MANIFEST_INVALID
SKILL_SCHEMA_INVALID
SKILL_RUNTIME_INCOMPATIBLE
SKILL_TOOL_MISSING
AGENT_SESSION_NOT_FOUND
AGENT_SESSION_CLOSED
AGENT_SESSION_BUSY
AGENT_TASK_NOT_FOUND
AGENT_TASK_ALREADY_RUNNING
AGENT_TASK_NOT_WAITING_INPUT
AGENT_TASK_NOT_CANCELLABLE
AGENT_RUN_INTERRUPTED
AGENT_CONTEXT_INVALID
AGENT_CONTEXT_REQUIREMENT_MISSING
TOOL_NOT_FOUND
TOOL_INPUT_INVALID
TOOL_CALL_DUPLICATED
PERMISSION_REQUIRED
PERMISSION_ALREADY_RESOLVED
PERMISSION_DENIED
IDEMPOTENCY_KEY_REUSED
REVISION_CONFLICT
```

所有错误使用统一 Problem Detail。

---

## 18. 安全与审计

### 18.1 Secret Reference

数据库只保存：

```text
secret://provider/openai/default
secret://runtime/codex/default
```

不保存 API Key 明文。

### 18.2 Environment

Adapter 构建 Runtime Environment 时：

- 从允许的 Secret Reference 注入。
- 不继承无关环境变量。
- 日志中脱敏 Token、Cookie 和 Authorization。
- 不允许 Skill Manifest 任意指定宿主环境变量值。

### 18.3 Workspace

默认 Runtime Workspace：

```text
data/studio-v2/agent-workspaces/{session-id}
```

项目内容通过 Context Package、受控副本或 Tool Gateway 提供。

### 18.4 审计

必须审计：

- Runtime 配置变化。
- Agent Profile Revision。
- Skill 安装、激活和禁用。
- Task 和 Run。
- Tool Call。
- Permission Request 与 Decision。
- Artifact 创建和领域写回。
- 进程执行、网络访问、文件系统写入。

### 18.5 日志保留

日志保留策略可配置。删除日志文件后数据库保留：

- 摘要。
- checksum。
- 删除时间。
- 原大小。

---

## 19. 后端模块结构

```text
app/
├── api/v2/
│   ├── agent_runtimes.py
│   ├── agent_profiles.py
│   ├── skills.py
│   ├── agent_sessions.py
│   ├── agent_tasks.py
│   ├── permissions.py
│   ├── tools.py
│   └── agent_contexts.py
├── agent/
│   ├── domain/
│   │   ├── models.py
│   │   ├── enums.py
│   │   └── errors.py
│   ├── application/
│   │   ├── runtime_service.py
│   │   ├── agent_profile_service.py
│   │   ├── skill_service.py
│   │   ├── session_service.py
│   │   ├── task_service.py
│   │   ├── run_service.py
│   │   ├── context_builder.py
│   │   ├── tool_gateway.py
│   │   ├── permission_service.py
│   │   └── dispatcher.py
│   ├── adapters/
│   │   ├── base.py
│   │   ├── codex_cli.py
│   │   ├── gemini_cli.py
│   │   ├── generic_jsonl.py
│   │   ├── generic_stdio.py
│   │   └── acp.py
│   ├── infrastructure/
│   │   ├── db.py
│   │   ├── repositories/
│   │   ├── skill_filesystem.py
│   │   ├── workspace_manager.py
│   │   ├── event_outbox.py
│   │   ├── log_store.py
│   │   └── secret_resolver.py
│   └── schemas/
│       ├── runtime.py
│       ├── agent.py
│       ├── skill.py
│       ├── session.py
│       ├── task.py
│       ├── permission.py
│       └── context.py
└── migrations/
```

P0 不要求先移动现有 `main.py`。可以：

```text
main.py include_router(v2_agent_router)
```

逐步把现有 Codex / Gemini helper 抽成可复用 Infrastructure 函数。

---

## 20. P0 实施顺序

### 阶段 A：持久化骨架

1. 创建 `studio.db`。
2. Alembic 初始 Migration。
3. Repository 和 Unit of Work。
4. Event Outbox。
5. ID、时间、JSON、Problem Detail 工具。

### 阶段 B：管理控制面

1. Runtime Profile CRUD 与 Probe。
2. Agent Profile CRUD 与 Revision。
3. Skill Discover、Validate、Import 和 Version。
4. Agent Skill Binding。
5. Agent Center 对应 OpenAPI。

### 阶段 C：任务执行面

1. Session。
2. Context Preview / Snapshot。
3. Task / Run。
4. Dispatcher 和 Lease。
5. Generic Adapter Interface。
6. 首个 Codex CLI Adapter。
7. Message / Step / Event。

### 阶段 D：Tool 与 Permission

1. Tool Registry。
2. Tool Gateway。
3. Tool Call 审计。
4. Permission Request / Grant。
5. MCP / Adapter Native Tool Bridge。
6. Artifact Proposal。

### 阶段 E：前端闭环

1. Runtimes 页面。
2. Agents 页面。
3. Skills 页面。
4. Agent Dock。
5. Task Timeline。
6. Permission Card。
7. Artifact Preview。

---

## 21. 测试要求

### 21.1 Repository

- 外键约束。
- Revision 冲突。
- 软删除后历史查询。
- Task Active Run 一致性。
- Attempt 唯一性。
- Permission 原子解决。
- Event Outbox 与业务事务一致。

### 21.2 Skill

- 正常包导入。
- 路径穿越 ZIP。
- 重复版本。
- Manifest 缺失。
- Schema 非法。
- Runtime Capability 不兼容。
- Tool 缺失。
- 版本激活不影响历史 Run。

### 21.3 Dispatcher

- 正常 Run。
- Adapter 启动失败。
- Runtime 中途退出。
- Cancel。
- Permission Waiting。
- Input Waiting。
- Lease 过期。
- 服务重启恢复。
- 重复 Runtime Event。

### 21.4 Tool Gateway

- 输入 Schema 拒绝。
- Read 自动允许。
- Write 请求权限。
- Deny。
- 同一 Tool Call 幂等。
- 大结果写 Resource Ref。
- Secret 脱敏。

### 21.5 API

- OpenAPI Snapshot。
- Cursor Pagination。
- Problem Detail。
- Idempotency。
- 409 Revision Conflict。
- 404 资源不存在。
- Pending Permission 刷新恢复。

---

## 22. P0 验收标准

P0 完成必须满足：

1. 重启应用后 Agent、Skill、Session、Task 和 Permission 历史仍存在。
2. 一个 Agent 可以绑定多个 Skill。
3. Skill Version 在历史 Run 中固定且可追溯。
4. Runtime Probe 能明确展示能力与失败原因。
5. Task 创建立即返回并通过事件更新状态。
6. Task 可以取消和重试，Retry 不覆盖历史 Run。
7. Context Preview 与实际 Snapshot 可对照。
8. Runtime 不支持某能力时 UI 和 API 都明确降级，不伪造支持。
9. Tool Call 有完整参数摘要、状态、结果和错误记录。
10. Permission Request 刷新后仍可继续审批。
11. 同一副作用 Tool Call 重放不会重复执行。
12. 服务中断后无法恢复的 Run 被标记为 Interrupted，而不是静默消失。
13. Agent 结构化输出能够保存为 Artifact Proposal 或 Artifact Link。
14. 旧 `/api/chat*`、`/api/codex/*` 和 `/api/gemini-cli/*` 接口不受破坏。
15. 所有 P0 `/api/v2` 接口具有明确 Pydantic Response Model。

---

## 23. 后续专项依赖

完成本设计后，下一步优先设计：

1. Asset、AssetVersion、Artifact、ArtifactVersion 和统一 Resource Reference。
2. GenerationJob 与 Agent Task 的共用 Job / Event 边界。
3. Event Hub Outbox Publisher、Replay、聚合和限流。
4. Project Bible、Script、Character、Scene、Shot 与 Storyboard Tool Contract。
5. Agent Center 与 Agent Dock 可交互原型。

Legacy Canvas 导入仍属于后续兼容专题，不是 Agent P0 前置条件。
