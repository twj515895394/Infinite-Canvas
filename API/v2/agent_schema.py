"""Agent/Skill P0 SQLite 表结构与领域常量（B6/B7/B8）。

契约：docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md §5-§7
- DDL 与 P0 基线字段语义一致（列名/默认值/唯一索引），实现按现有 v2 约定（原生 sqlite3）调整。
- 所有时间戳为 Epoch 毫秒（与现有 v2 一致；文档的 ISO 输出由前端格式化层承担）。
- 软删除统一用 deleted_at_ms 标记；历史 Run 不因配置删除而失效。

表：agent_runtime_profiles / agent_runtime_probes / agent_profiles /
agent_profile_revisions / skills / skill_installations / skill_versions /
agent_skill_bindings / agent_sessions / agent_tasks / agent_runs / agent_steps /
agent_messages / context_snapshots / context_references / tool_calls /
permission_requests / permission_grants / idempotency_records / studio_event_outbox
"""

AGENT_SCHEMA: list[str] = [
    # ---- Runtime Profile（B6） ----
    """
    CREATE TABLE IF NOT EXISTS agent_runtime_profiles (
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
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS ux_runtime_profile_name_active
    ON agent_runtime_profiles(name) WHERE deleted_at_ms IS NULL
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_runtime_profile_enabled
    ON agent_runtime_profiles(enabled, deleted_at_ms)
    """,
    # ---- Runtime Probe History（B6） ----
    """
    CREATE TABLE IF NOT EXISTS agent_runtime_probes (
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
        FOREIGN KEY (runtime_profile_id) REFERENCES agent_runtime_profiles(id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_runtime_probe_profile_time
    ON agent_runtime_probes(runtime_profile_id, started_at_ms DESC)
    """,
    # ---- Agent Profile 与 Revision（B7） ----
    """
    CREATE TABLE IF NOT EXISTS agent_profiles (
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
        FOREIGN KEY (runtime_profile_id) REFERENCES agent_runtime_profiles(id)
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_slug_active
    ON agent_profiles(slug) WHERE deleted_at_ms IS NULL
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_agent_runtime
    ON agent_profiles(runtime_profile_id, enabled, deleted_at_ms)
    """,
    """
    CREATE TABLE IF NOT EXISTS agent_profile_revisions (
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
        FOREIGN KEY (agent_profile_id) REFERENCES agent_profiles(id),
        UNIQUE (agent_profile_id, revision)
    )
    """,
    # ---- Skill、Installation 与 Version（B7） ----
    """
    CREATE TABLE IF NOT EXISTS skills (
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
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS ux_skill_key_active
    ON skills(skill_key) WHERE deleted_at_ms IS NULL
    """,
    """
    CREATE TABLE IF NOT EXISTS skill_installations (
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
        FOREIGN KEY (skill_id) REFERENCES skills(id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_skill_installation_lookup
    ON skill_installations(skill_id, project_id, priority)
    """,
    """
    CREATE TABLE IF NOT EXISTS skill_versions (
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
        FOREIGN KEY (skill_id) REFERENCES skills(id),
        FOREIGN KEY (installation_id) REFERENCES skill_installations(id),
        UNIQUE (installation_id, version)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_skill_version_skill
    ON skill_versions(skill_id, version)
    """,
    # ---- Agent Skill Binding（B7） ----
    """
    CREATE TABLE IF NOT EXISTS agent_skill_bindings (
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
        FOREIGN KEY (agent_profile_id) REFERENCES agent_profiles(id),
        FOREIGN KEY (skill_id) REFERENCES skills(id),
        UNIQUE (agent_profile_id, skill_id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_agent_skill_order
    ON agent_skill_bindings(agent_profile_id, enabled, priority)
    """,
    # ---- Agent Session（B8） ----
    """
    CREATE TABLE IF NOT EXISTS agent_sessions (
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
        FOREIGN KEY (agent_profile_id) REFERENCES agent_profiles(id),
        FOREIGN KEY (runtime_profile_id) REFERENCES agent_runtime_profiles(id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_agent_session_project_status
    ON agent_sessions(project_id, status, last_activity_at_ms DESC)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_agent_session_profile
    ON agent_sessions(agent_profile_id, last_activity_at_ms DESC)
    """,
    # ---- Agent Task（B8） ----
    """
    CREATE TABLE IF NOT EXISTS agent_tasks (
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
        FOREIGN KEY (session_id) REFERENCES agent_sessions(id),
        FOREIGN KEY (agent_profile_id) REFERENCES agent_profiles(id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_agent_task_session_time
    ON agent_tasks(session_id, created_at_ms DESC)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_agent_task_project_status
    ON agent_tasks(project_id, status, updated_at_ms DESC)
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_task_idempotency
    ON agent_tasks(session_id, idempotency_key) WHERE idempotency_key IS NOT NULL
    """,
    # ---- Agent Run（B8） ----
    """
    CREATE TABLE IF NOT EXISTS agent_runs (
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
        FOREIGN KEY (task_id) REFERENCES agent_tasks(id),
        FOREIGN KEY (runtime_profile_id) REFERENCES agent_runtime_profiles(id),
        FOREIGN KEY (context_snapshot_id) REFERENCES context_snapshots(id),
        UNIQUE (task_id, attempt)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_agent_run_dispatch
    ON agent_runs(status, lease_expires_at_ms, created_at_ms)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_agent_run_task
    ON agent_runs(task_id, attempt DESC)
    """,
    # ---- Agent Step 与 Message（B8） ----
    """
    CREATE TABLE IF NOT EXISTS agent_steps (
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
        FOREIGN KEY (run_id) REFERENCES agent_runs(id),
        UNIQUE (run_id, sequence)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_agent_step_run_sequence
    ON agent_steps(run_id, sequence)
    """,
    """
    CREATE TABLE IF NOT EXISTS agent_messages (
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
        FOREIGN KEY (session_id) REFERENCES agent_sessions(id),
        FOREIGN KEY (task_id) REFERENCES agent_tasks(id),
        FOREIGN KEY (run_id) REFERENCES agent_runs(id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_agent_message_session_sequence
    ON agent_messages(session_id, sequence)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_agent_message_task
    ON agent_messages(task_id, created_at_ms)
    """,
    # ---- Context Snapshot（B8） ----
    """
    CREATE TABLE IF NOT EXISTS context_snapshots (
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
        FOREIGN KEY (task_id) REFERENCES agent_tasks(id),
        FOREIGN KEY (run_id) REFERENCES agent_runs(id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_context_snapshot_task
    ON context_snapshots(task_id, created_at_ms DESC)
    """,
    """
    CREATE TABLE IF NOT EXISTS context_references (
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
        FOREIGN KEY (snapshot_id) REFERENCES context_snapshots(id),
        UNIQUE (snapshot_id, sequence)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_context_reference_lookup
    ON context_references(reference_type, reference_id)
    """,
    # ---- Tool Call（B8） ----
    """
    CREATE TABLE IF NOT EXISTS tool_calls (
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
        FOREIGN KEY (run_id) REFERENCES agent_runs(id),
        FOREIGN KEY (step_id) REFERENCES agent_steps(id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_tool_call_run
    ON tool_calls(run_id, created_at_ms)
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS ux_tool_call_runtime_id
    ON tool_calls(run_id, runtime_call_id) WHERE runtime_call_id IS NOT NULL
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS ux_tool_call_idempotency
    ON tool_calls(tool_id, idempotency_key) WHERE idempotency_key IS NOT NULL
    """,
    # ---- Permission Request 与 Grant（B8） ----
    """
    CREATE TABLE IF NOT EXISTS permission_requests (
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
        FOREIGN KEY (run_id) REFERENCES agent_runs(id),
        FOREIGN KEY (tool_call_id) REFERENCES tool_calls(id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_permission_request_pending
    ON permission_requests(status, created_at_ms)
    """,
    """
    CREATE TABLE IF NOT EXISTS permission_grants (
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
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_permission_grant_match
    ON permission_grants(scope, scope_id, permission_key, revoked_at_ms, expires_at_ms)
    """,
    # ---- Idempotency（B8） ----
    """
    CREATE TABLE IF NOT EXISTS idempotency_records (
        namespace TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_checksum TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        response_json TEXT,
        created_at_ms INTEGER NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        PRIMARY KEY (namespace, idempotency_key)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_idempotency_expiry
    ON idempotency_records(expires_at_ms)
    """,
    # ---- Studio Event Outbox（B8） ----
    """
    CREATE TABLE IF NOT EXISTS studio_event_outbox (
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
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_event_outbox_unpublished
    ON studio_event_outbox(published_at_ms, sequence)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_event_outbox_project_sequence
    ON studio_event_outbox(project_id, sequence)
    """,
]

# ---- 领域枚举（与 P0 契约 §6/§9 对齐） ----

ADAPTER_TYPES = {"acp", "cli-jsonl", "cli-stdio", "http", "embedded-tool"}

RUNTIME_STATUSES = {"unknown", "probing", "ready", "unavailable", "auth-required", "incompatible", "disabled"}

RUNTIME_PROBE_STATUSES = {"ready", "unavailable", "auth-required", "incompatible"}

AGENT_PROFILE_STATUSES = {"draft", "ready", "disabled"}

SKILL_STATUSES = {"discovered", "imported", "broken"}
SKILL_VALIDATION_STATUSES = {"pending", "validating", "ready", "incompatible", "broken"}
SKILL_SOURCE_TYPES = {"builtin", "local", "project", "git", "runtime-native", "imported"}
SKILL_EXECUTION_MODES = {"prompt", "markdown", "studio-tool", "runtime-native"}

# Task 状态（MVP §9.5 简化；P0 契约 §6.7 的 draft/preparing/waiting_permission 在 MVP 中并入 running 语义）
TASK_STATUSES = {"draft", "queued", "preparing", "running", "waiting_permission", "waiting_input", "succeeded", "failed", "cancel_requested", "cancelled"}

RUN_STATUSES = {"queued", "preparing", "running", "waiting_permission", "waiting_input", "succeeded", "failed", "cancel_requested", "cancelled", "interrupted"}

SESSION_STATUSES = {"creating", "ready", "running", "waiting_input", "waiting_permission", "closing", "closed", "failed"}

STEP_KINDS = {
    "planning",
    "status-summary",
    "skill-start",
    "skill-end",
    "tool-call",
    "permission",
    "input-request",
    "artifact-create",
    "checkpoint",
    "result",
    "diagnostic",
}

RISK_LEVELS = {"low", "medium", "high", "critical"}
PERMISSION_SCOPES = {"once", "session", "project"}

# 任务幂等 Namespace（§16.1）
TASK_IDEMPOTENCY_NAMESPACE = "agent-task-create"


def now_ms() -> int:
    import time

    return int(time.time() * 1000)
