"""Agent Task 执行闭环路由与状态机（切片 13 B8）。

契约：docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md §6.7-6.9/§9.7-9.8/§10.7-10.10/§13/§14
- Task 创建 10 步事务：校验 Session/Agent/Runtime → 解析 Skill → 校验 Context → 写 User Message
  → 建 Task → 建 Run attempt 1 → 设 active_run_id → 写幂等记录 → 写 Outbox → 返回 queued。
- 状态机：queued→preparing→running→succeeded/failed；取消 cancel_requested→cancelled；
  waiting_input 等待用户输入；Retry 复用原 Task 建新 Run（attempt+1，历史保留）。
- 幂等：namespace=agent-task-create:{session_id}，落 idempotency_records 表（重启保留）。
- 事件流：GET /agent-tasks/{id}/events 轮询（MVP 无 WebSocket）；Run/Steps 详情。
- Dispatcher：后台 asyncio 循环 Claim queued Run（30s 租约）→ Context Snapshot → Adapter → 事件消费。
- 重启恢复：启动时把 preparing/running 且租约过期的 Run 标 interrupted，Task 标 failed。
"""

import asyncio
import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from API.v2 import db
from API.v2.agent_adapters import get_adapter
from API.v2.agent_context import create_snapshot, get_snapshot_asset_refs, snapshot_dto
from API.v2.agent_dtos import run_dto, step_dto, task_dto
from API.v2.agent_repo import dump_json, load_json, now_ms, require_agent, require_runtime, require_skill
from API.v2.agent_schema import TASK_IDEMPOTENCY_NAMESPACE
from API.v2.problems import ErrorCode, V2Error

router = APIRouter()

# Dispatcher 调度开关（测试可注入关闭）；按需调度（BackgroundTasks 驱动，无独立后台循环）
AUTO_DISPATCH = True
# 任务幂等记录 TTL（毫秒）：24h
IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000


class AgentTaskContextRequest(BaseModel):
    project_id: Optional[str] = None
    selection_refs: List[Dict[str, Any]] = Field(default_factory=list)
    attachment_asset_version_ids: List[str] = Field(default_factory=list)
    policy_overrides: Dict[str, Any] = Field(default_factory=dict)


class AgentOutputPolicy(BaseModel):
    mode: str = "message-only"
    artifact_type: Optional[str] = None
    require_preview_before_write: bool = True


class AgentPermissionPolicy(BaseModel):
    read: str = "allow"
    write: str = "allow"
    destructive: str = "ask"
    generation: str = "ask"
    process: str = "ask"
    network: str = "ask"


class AgentTaskCreate(BaseModel):
    agent_profile_id: str = Field(min_length=1)
    skill_id: Optional[str] = None
    skill_version_constraint: Optional[str] = None
    message: str = Field(min_length=1, max_length=20000)
    context: AgentTaskContextRequest = Field(default_factory=AgentTaskContextRequest)
    output_policy: AgentOutputPolicy = Field(default_factory=AgentOutputPolicy)
    permission_policy: AgentPermissionPolicy = Field(default_factory=AgentPermissionPolicy)
    idempotency_key: str = ""


class RetryRequest(BaseModel):
    mode: str = "original-context"
    message_override: Optional[str] = None


class UserInputRequest(BaseModel):
    message: str = Field(min_length=1)
    attachment_asset_version_ids: List[str] = Field(default_factory=list)


def _require_task(task_id: str) -> Dict[str, Any]:
    conn = db.get_connection()
    row = conn.execute("SELECT * FROM agent_tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        raise V2Error(
            code=ErrorCode.AGENT_TASK_NOT_FOUND,
            status=404,
            title="Task not found",
            detail=f"Agent Task {task_id} 不存在",
        )
    return dict(row)


def _require_run(run_id: str) -> Dict[str, Any]:
    conn = db.get_connection()
    row = conn.execute("SELECT * FROM agent_runs WHERE id = ?", (run_id,)).fetchone()
    if row is None:
        raise V2Error(
            code=ErrorCode.AGENT_RUN_NOT_FOUND,
            status=404,
            title="Run not found",
            detail=f"Agent Run {run_id} 不存在",
        )
    return dict(row)


def _task_request_checksum(payload: AgentTaskCreate) -> str:
    import hashlib

    body = {
        "agent_profile_id": payload.agent_profile_id,
        "skill_id": payload.skill_id,
        "skill_version_constraint": payload.skill_version_constraint,
        "message": payload.message,
        "context": payload.context.model_dump(),
        "output_policy": payload.output_policy.model_dump(),
        "permission_policy": payload.permission_policy.model_dump(),
    }
    return hashlib.sha256(dump_json(body).encode()).hexdigest()


def _write_outbox(conn, project_id: Optional[str], aggregate_type: str, aggregate_id: str, event_type: str, payload: Dict[str, Any]) -> None:
    conn.execute(
        "INSERT INTO studio_event_outbox (event_id, project_id, aggregate_type, aggregate_id, event_type, payload_json, created_at_ms) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (db.new_id("evt"), project_id, aggregate_type, aggregate_id, event_type, dump_json(payload), now_ms()),
    )


def _create_run(conn, task_id: str, attempt: int, runtime_profile_id: str, agent_revision: int, snapshot_id: Optional[str]) -> str:
    run_id = db.new_id("run")
    conn.execute(
        "INSERT INTO agent_runs (id, task_id, attempt, status, runtime_profile_id, agent_profile_revision, "
        "context_snapshot_id, created_at_ms) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?)",
        (run_id, task_id, attempt, runtime_profile_id, agent_revision, snapshot_id, now_ms()),
    )
    return run_id


def _append_message(conn, session_id: str, task_id: Optional[str], run_id: Optional[str], role: str, content: str, kind: str = "message") -> str:
    seq = conn.execute(
        "SELECT COALESCE(MAX(sequence), 0) + 1 AS s FROM agent_messages WHERE session_id = ?", (session_id,)
    ).fetchone()["s"]
    message_id = db.new_id("msg")
    conn.execute(
        "INSERT INTO agent_messages (id, session_id, task_id, run_id, sequence, role, kind, content, created_at_ms) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (message_id, session_id, task_id, run_id, seq, role, kind, content, now_ms()),
    )
    return message_id


# ---------- 创建 / 列表 / 详情 ----------


@router.post("/agent-sessions/{session_id}/tasks")
def create_task_v2(session_id: str, payload: AgentTaskCreate, background: BackgroundTasks) -> Dict:
    """创建 Task（10 步事务）。幂等：同 session + key 返回原 Task；同 key 不同请求 409。"""
    from API.v2.agent_sessions import _require_session

    session = _require_session(session_id)
    if session["status"] in ("closed", "closing"):
        raise V2Error(
            code=ErrorCode.AGENT_SESSION_CLOSED,
            status=422,
            title="Session closed",
            detail="Session 已关闭，无法创建新任务",
        )
    agent = require_agent(payload.agent_profile_id)
    runtime = require_runtime(agent["runtime_profile_id"])
    if not agent["enabled"]:
        raise V2Error(code=ErrorCode.AGENT_PROFILE_DISABLED, status=422, title="Agent disabled", detail="Agent 已禁用")
    if not runtime["enabled"]:
        raise V2Error(code=ErrorCode.AGENT_RUNTIME_UNAVAILABLE, status=422, title="Runtime disabled", detail="Runtime 已禁用")

    conn = db.get_connection()
    checksum = _task_request_checksum(payload)
    # 幂等：已有记录则返回原 Task（同请求）；不同请求 409
    if payload.idempotency_key:
        existing = conn.execute(
            "SELECT resource_id, request_checksum FROM idempotency_records WHERE namespace = ? AND idempotency_key = ?",
            (f"{TASK_IDEMPOTENCY_NAMESPACE}:{session_id}", payload.idempotency_key),
        ).fetchone()
        if existing:
            if existing["request_checksum"] != checksum:
                raise V2Error(
                    code=ErrorCode.IDEMPOTENCY_KEY_REUSED,
                    status=409,
                    title="Idempotency key reused",
                    detail="同一 Idempotency-Key 已用于不同的请求内容",
                )
            return {"task": task_dto(_require_task(existing["resource_id"]), with_runs=False), "reused": True}

    # 解析 Skill：绑定校验（若指定 skill_id）
    resolved_skill_id = payload.skill_id
    if resolved_skill_id:
        skill = require_skill(resolved_skill_id)
        if not skill["enabled"]:
            raise V2Error(code=ErrorCode.SKILL_NOT_FOUND, status=422, title="Skill disabled", detail="Skill 已禁用")
    now = now_ms()
    task_id = db.new_id("tsk")
    session_ctx = load_json(session.get("context_policy_json"), {})
    merged_ctx = {**session_ctx, **payload.context.policy_overrides}
    try:
        conn.execute(
            "INSERT INTO agent_tasks (id, session_id, project_id, agent_profile_id, requested_skill_id, "
            "requested_skill_version_constraint, message, status, context_request_json, output_policy_json, "
            "permission_policy_json, source_json, idempotency_key, revision, created_at_ms, updated_at_ms) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, '{}', ?, 1, ?, ?)",
            (
                task_id,
                session_id,
                payload.context.project_id or session.get("project_id"),
                agent["id"],
                resolved_skill_id,
                payload.skill_version_constraint,
                payload.message.strip(),
                dump_json(payload.context.model_dump()),
                dump_json(payload.output_policy.model_dump()),
                dump_json(payload.permission_policy.model_dump()),
                payload.idempotency_key or None,
                now,
                now,
            ),
        )
        run_id = _create_run(conn, task_id, 1, agent["runtime_profile_id"], agent["current_revision"], None)
        conn.execute("UPDATE agent_tasks SET active_run_id = ? WHERE id = ?", (run_id, task_id))
        _append_message(conn, session_id, task_id, run_id, "user", payload.message.strip())
        if payload.idempotency_key:
            conn.execute(
                "INSERT INTO idempotency_records (namespace, idempotency_key, request_checksum, resource_type, "
                "resource_id, created_at_ms, expires_at_ms) VALUES (?, ?, ?, 'agent_task', ?, ?, ?)",
                (
                    f"{TASK_IDEMPOTENCY_NAMESPACE}:{session_id}",
                    payload.idempotency_key,
                    checksum,
                    task_id,
                    now,
                    now + IDEMPOTENCY_TTL_MS,
                ),
            )
        conn.execute("UPDATE agent_sessions SET status = 'running', updated_at_ms = ?, last_activity_at_ms = ? WHERE id = ?", (now, now, session_id))
        _write_outbox(conn, session.get("project_id"), "agent_task", task_id, "agent.task.created", {"task_id": task_id})
        conn.commit()
    except Exception:
        conn.rollback()
        # 幂等并发首建：唯一索引冲突（同 key 两请求同时通过 SELECT）→ 回查复用（§16.1）
        if payload.idempotency_key:
            existing = conn.execute(
                "SELECT resource_id, request_checksum FROM idempotency_records WHERE namespace = ? AND idempotency_key = ?",
                (f"{TASK_IDEMPOTENCY_NAMESPACE}:{session_id}", payload.idempotency_key),
            ).fetchone()
            if existing and existing["request_checksum"] == checksum:
                return JSONResponse(
                    status_code=200,
                    content={"task": task_dto(_require_task(existing["resource_id"]), with_runs=False), "reused": True},
                )
        raise
    if AUTO_DISPATCH:
        background.add_task(dispatch_once)
    return JSONResponse(
        status_code=201,
        content={"task": task_dto(_require_task(task_id), with_runs=False), "reused": False},
    )


@router.get("/agent-tasks")
def list_tasks_v2(
    session_id: Optional[str] = None,
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
) -> Dict:
    """Task 列表（session/project/status 过滤，最近更新优先）。"""
    limit = max(1, min(200, limit))
    where: List[str] = []
    params: List[Any] = []
    if session_id:
        where.append("session_id = ?")
        params.append(session_id)
    if project_id:
        where.append("project_id = ?")
        params.append(project_id)
    if status:
        where.append("status = ?")
        params.append(status)
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""
    conn = db.get_connection()
    rows = [
        dict(r)
        for r in conn.execute(
            f"SELECT * FROM agent_tasks{where_sql} ORDER BY updated_at_ms DESC LIMIT ?", [*params, limit]
        ).fetchall()
    ]
    return {"items": [task_dto(r, with_runs=False) for r in rows], "total": len(rows)}


@router.get("/agent-tasks/{task_id}")
def get_task_v2(task_id: str) -> Dict:
    return {"task": task_dto(_require_task(task_id))}


@router.get("/agent-tasks/{task_id}/runs")
def list_task_runs_v2(task_id: str) -> Dict:
    _require_task(task_id)
    conn = db.get_connection()
    rows = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM agent_runs WHERE task_id = ? ORDER BY attempt DESC", (task_id,)
        ).fetchall()
    ]
    return {"items": [run_dto(r) for r in rows]}


@router.get("/agent-runs/{run_id}")
def get_run_v2(run_id: str) -> Dict:
    return {"run": run_dto(_require_run(run_id))}


@router.get("/agent-runs/{run_id}/steps")
def list_run_steps_v2(run_id: str) -> Dict:
    _require_run(run_id)
    conn = db.get_connection()
    rows = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM agent_steps WHERE run_id = ? ORDER BY sequence", (run_id,)
        ).fetchall()
    ]
    return {"items": [step_dto(r) for r in rows]}


@router.get("/agent-tasks/{task_id}/events")
def get_task_events_v2(task_id: str, cursor: int = 0) -> Dict:
    """事件流（轮询契约）：返回 Run 状态 + 新消息 + 新 Steps，cursor 为已见消息数。"""
    task = _require_task(task_id)
    conn = db.get_connection()
    messages = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM agent_messages WHERE task_id = ? AND sequence > ? ORDER BY sequence",
            (task_id, cursor),
        ).fetchall()
    ]
    events = []
    for msg in messages:
        events.append(
            {
                "sequence": msg["sequence"],
                "event_type": "message-completed" if msg["role"] == "assistant" else "message",
                "role": msg["role"],
                "content": msg.get("content"),
                "created_at": msg["created_at_ms"],
            }
        )
    next_cursor = max([m["sequence"] for m in messages], default=cursor)
    return {
        "task_id": task_id,
        "status": task["status"],
        "events": events,
        "next_cursor": next_cursor,
        "run": run_dto(dict(conn.execute("SELECT * FROM agent_runs WHERE id = ?", (task["active_run_id"],)).fetchone())) if task.get("active_run_id") else None,
    }


# ---------- 取消 / 重试 / 输入 ----------


@router.post("/agent-tasks/{task_id}/cancel")
def cancel_task_v2(task_id: str, payload: Optional[Dict[str, Any]] = None) -> Dict:
    """取消 Task：queued/preparing 直接 cancelled；running → cancel_requested → Adapter 取消 → cancelled。"""
    task = _require_task(task_id)
    if task["status"] in ("succeeded", "failed", "cancelled"):
        return {"task": task_dto(task), "note": "already terminal"}
    if task["status"] == "queued" or task["status"] == "preparing":
        _finish_cancel(task_id)
        return {"task": task_dto(_require_task(task_id))}
    if task["status"] in ("running", "waiting_input", "waiting_permission"):
        now = now_ms()
        conn = db.get_connection()
        conn.execute(
            "UPDATE agent_tasks SET status = 'cancel_requested', updated_at_ms = ?, error_json = ? WHERE id = ?",
            (now, dump_json({"reason": (payload or {}).get("reason", "用户取消")}) if payload else None, task_id),
        )
        if task["active_run_id"]:
            conn.execute("UPDATE agent_runs SET status = 'cancel_requested' WHERE id = ?", (task["active_run_id"],))
        conn.commit()
        if AUTO_DISPATCH:
            # 取消由 Dispatcher 轮询处理（简化：直接同步调用 Adapter 取消）
            run = _require_run(task["active_run_id"])
            adapter = get_adapter(_runtime_adapter_type(run))
            if run.get("runtime_task_id"):
                try:
                    asyncio.run(adapter.cancel_task(run["runtime_task_id"]))
                except Exception:
                    pass
            _finish_cancel(task_id)
        return {"task": task_dto(_require_task(task_id))}
    raise V2Error(
        code=ErrorCode.AGENT_TASK_NOT_CANCELLABLE,
        status=409,
        title="Task not cancellable",
        detail=f"任务状态 {task['status']} 不可取消",
    )


def _runtime_adapter_type(run: Dict[str, Any]) -> str:
    conn = db.get_connection()
    row = conn.execute("SELECT adapter_type FROM agent_runtime_profiles WHERE id = ?", (run["runtime_profile_id"],)).fetchone()
    return row["adapter_type"] if row else "cli-stdio"


def _finish_cancel(task_id: str) -> None:
    now = now_ms()
    conn = db.get_connection()
    task = _require_task(task_id)
    conn.execute(
        "UPDATE agent_tasks SET status = 'cancelled', finished_at_ms = ?, updated_at_ms = ? WHERE id = ?",
        (now, now, task_id),
    )
    if task["active_run_id"]:
        conn.execute(
            "UPDATE agent_runs SET status = 'cancelled', finished_at_ms = ? WHERE id = ?",
            (now, task["active_run_id"]),
        )
    _set_session_ready_if_idle(conn, task, now)
    _write_outbox(conn, task.get("project_id"), "agent_task", task_id, "agent.task.cancelled", {"task_id": task_id})
    conn.commit()


@router.post("/agent-tasks/{task_id}/retry")
def retry_task_v2(task_id: str, payload: RetryRequest = RetryRequest(), background: BackgroundTasks = None) -> Dict:
    """Retry：复用原 Task 建新 Run（attempt+1，历史保留）；original-context 复用原 Snapshot。

    立即返回 queued（不阻塞）；调度走 BackgroundTasks（避免 HTTP 同步阻塞整个 Run）。
    """
    task = _require_task(task_id)
    if task["status"] not in ("failed", "cancelled"):
        raise V2Error(
            code=ErrorCode.AGENT_TASK_ALREADY_RUNNING,
            status=409,
            title="Task still running",
            detail="只有失败或取消的任务可重试",
        )
    conn = db.get_connection()
    agent = require_agent(task["agent_profile_id"])
    runtime = require_runtime(agent["runtime_profile_id"])
    prev_run = conn.execute(
        "SELECT * FROM agent_runs WHERE task_id = ? ORDER BY attempt DESC LIMIT 1", (task_id,)
    ).fetchone()
    next_attempt = (prev_run["attempt"] if prev_run else 0) + 1
    # original-context：复用原 Snapshot
    snapshot_id = None
    if payload.mode == "original-context" and prev_run and prev_run["context_snapshot_id"]:
        snapshot_id = prev_run["context_snapshot_id"]
    now = now_ms()
    run_id = _create_run(conn, task_id, next_attempt, agent["runtime_profile_id"], agent["current_revision"], snapshot_id)
    # message_override（§10.9）：重试时替换用户消息
    message = payload.message_override if payload.message_override else task["message"]
    if payload.message_override:
        _append_message(conn, task["session_id"], task_id, run_id, "user", payload.message_override.strip())
    conn.execute(
        "UPDATE agent_tasks SET status = 'queued', active_run_id = ?, updated_at_ms = ?, finished_at_ms = NULL, "
        "error_json = NULL WHERE id = ?",
        (run_id, now, task_id),
    )
    conn.execute("UPDATE agent_sessions SET status = 'running', updated_at_ms = ?, last_activity_at_ms = ? WHERE id = ?", (now, now, task["session_id"]))
    conn.commit()
    if AUTO_DISPATCH and background is not None:
        background.add_task(dispatch_once)
    elif AUTO_DISPATCH:
        asyncio.run(dispatch_run(run_id))
    return {"task": task_dto(_require_task(task_id))}


@router.post("/agent-tasks/{task_id}/input")
def submit_task_input_v2(task_id: str, payload: UserInputRequest) -> Dict:
    """waiting_input 补充输入：保存 User Message → 恢复 running → Dispatcher 继续。"""
    task = _require_task(task_id)
    if task["status"] != "waiting_input":
        raise V2Error(
            code=ErrorCode.AGENT_TASK_NOT_WAITING_INPUT,
            status=409,
            title="Task not waiting input",
            detail="任务不在等待输入状态",
        )
    run = _require_run(task["active_run_id"]) if task.get("active_run_id") else None
    conn = db.get_connection()
    now = now_ms()
    _append_message(conn, task["session_id"], task_id, run["id"] if run else None, "user", payload.message.strip())
    if run:
        conn.execute("UPDATE agent_runs SET status = 'running' WHERE id = ?", (run["id"],))
    conn.execute("UPDATE agent_tasks SET status = 'running', updated_at_ms = ? WHERE id = ?", (now, task_id))
    conn.commit()
    if AUTO_DISPATCH and run:
        asyncio.run(dispatch_run(run["id"]))
    return {"task": task_dto(_require_task(task_id))}


# ---------- Dispatcher ----------


async def dispatch_run(run_id: str) -> None:
    """执行单个 Run：Claim（preparing）→ Context Snapshot → Adapter submit → 消费事件 → 终态。"""
    conn = db.get_connection()
    run = conn.execute("SELECT * FROM agent_runs WHERE id = ?", (run_id,)).fetchone()
    if run is None:
        return
    run = dict(run)
    task = _require_task(run["task_id"])
    # 取消/终态拦截：cancel_requested 走取消完成；cancelled 直接返回（防竞态覆盖）
    if task["status"] == "cancel_requested":
        _finish_cancel(task["id"])
        return
    if task["status"] == "cancelled" or run["status"] == "cancelled":
        return
    if task["status"] in ("succeeded", "failed"):
        return  # 已终态（幂等重放保护）
    now = now_ms()
    # Claim：queued → preparing（原子条件更新防双 Claim）；waiting_input 续跑跳过 Claim
    if run["status"] == "queued":
        updated = conn.execute(
            "UPDATE agent_runs SET status = 'preparing', lease_owner = ?, lease_expires_at_ms = ?, started_at_ms = ? "
            "WHERE id = ? AND status = 'queued'",
            ("dispatcher", now + 30_000, now, run_id),
        ).rowcount
        if updated == 0:
            return  # 已被 Claim（并发）
        conn.commit()
    task = _require_task(run["task_id"])
    # Context Snapshot（Run 启动时固定 Pinned Version）
    ctx_request = load_json(task.get("context_request_json"), {})
    policy = {"output_policy": load_json(task.get("output_policy_json"), {}), "permission_policy": load_json(task.get("permission_policy_json"), {})}
    snapshot_id = run.get("context_snapshot_id")
    try:
        if not snapshot_id:
            # 附件版本并入快照引用（与 preview 一致：version_ref 是 avr_*，reference_id 是资产 id）
            selection_refs = list(ctx_request.get("selection_refs") or [])
            for version_id in ctx_request.get("attachment_asset_version_ids") or []:
                av = conn.execute("SELECT asset_id FROM asset_versions WHERE id = ?", (version_id,)).fetchone()
                if av:
                    selection_refs.append(
                        {"reference_type": "asset", "reference_id": av["asset_id"], "version_ref": version_id, "required": False}
                    )
            snapshot = create_snapshot(
                task["id"],
                run_id,
                task.get("project_id"),
                selection_refs,
                policy,
            )
            snapshot_id = snapshot["id"]
            conn.execute("UPDATE agent_runs SET context_snapshot_id = ? WHERE id = ?", (snapshot_id, run_id))
            conn.commit()
        # 组装 Adapter 请求
        agent = require_agent(task["agent_profile_id"])
        runtime = require_runtime(agent["runtime_profile_id"])
        adapter = get_adapter(runtime["adapter_type"])
        from API.v2.agent_repo import latest_revision

        rev = latest_revision(agent["id"]) or {}
        asset_refs = get_snapshot_asset_refs(snapshot_id)
        skills = _resolved_skills(task)
        conn.execute("UPDATE agent_runs SET status = 'running' WHERE id = ?", (run_id,))
        conn.execute("UPDATE agent_tasks SET status = 'running', updated_at_ms = ? WHERE id = ?", (now, task["id"]))
        conn.commit()
        request = {
            "studio_session_id": task["session_id"],
            "studio_task_id": task["id"],
            "studio_run_id": run_id,
            "user_message": task["message"],
            "model": agent.get("default_model"),
            "instructions": rev.get("instructions_text", ""),
            "skills": skills,
            "asset_refs": asset_refs,
            "output_policy": load_json(task.get("output_policy_json"), {}),
            "permission_policy": load_json(task.get("permission_policy_json"), {}),
        }
        runtime_task_id = await adapter.submit_task(request)
        conn.execute("UPDATE agent_runs SET runtime_task_id = ? WHERE id = ?", (runtime_task_id, run_id))
        conn.commit()
        # 消费事件
        result_summary = ""
        failed_error = None
        async for event in adapter.stream_events(runtime_task_id):
            _consume_event(task, run_id, event)
            if event.event_type == "completed":
                result_summary = str(event.payload.get("summary") or result_summary)
            elif event.event_type == "failed":
                failed_error = {
                    "message": str(event.payload.get("message") or event.payload.get("error") or "执行失败"),
                }
        if failed_error:
            _finish_failed(task["id"], run_id, failed_error["message"])
        else:
            _finish_succeeded(task["id"], run_id, result_summary)
    except Exception as exc:
        _finish_failed(task["id"], run_id, str(exc)[:500])


def _resolved_skills(task: Dict[str, Any]) -> List[Dict[str, Any]]:
    """解析绑定 Skill 的激活版本（Pinned：Run 创建后不随激活切换变化）。"""
    conn = db.get_connection()
    skill_id = task.get("requested_skill_id")
    if not skill_id:
        return []
    skill = conn.execute("SELECT * FROM skills WHERE id = ? AND deleted_at_ms IS NULL", (skill_id,)).fetchone()
    if skill is None or not skill["active_version_id"]:
        return []
    v = conn.execute("SELECT * FROM skill_versions WHERE id = ?", (skill["active_version_id"],)).fetchone()
    if v is None:
        return []
    md_text = ""
    try:
        root = None
        inst = conn.execute("SELECT root_path FROM skill_installations WHERE id = ?", (v["installation_id"],)).fetchone()
        if inst:
            import os

            md_path = os.path.join(inst["root_path"], "SKILL.md")
            if os.path.isfile(md_path):
                with open(md_path, "r", encoding="utf-8") as f:
                    md_text = f.read()[:8000]
    except Exception:
        md_text = ""
    return [
        {
            "skill_id": skill_id,
            "skill_key": skill["skill_key"],
            "name": skill["name"],
            "version_id": v["id"],
            "version": v["version"],
            "skill_md": md_text,
        }
    ]


def _consume_event(task: Dict[str, Any], run_id: str, event: Any) -> None:
    """消费归一化事件：写 Step / Message / 状态迁移。

    - message-completed → assistant 消息
    - input-requested → Task/Run 转 waiting_input（用户 POST /input 恢复）
    - tool-call-proposed → 落 tool_calls（幂等键查重）
    - step-* / diagnostic / checkpoint / artifact-proposed → Steps
    """
    conn = db.get_connection()
    if event.event_type == "message-completed":
        content = str(event.payload.get("content") or "")
        if content:
            _append_message(conn, task["session_id"], task["id"], run_id, "assistant", content)
            conn.commit()
    elif event.event_type == "input-requested":
        now = now_ms()
        conn.execute("UPDATE agent_runs SET status = 'waiting_input' WHERE id = ?", (run_id,))
        conn.execute("UPDATE agent_tasks SET status = 'waiting_input', updated_at_ms = ? WHERE id = ?", (now, task["id"]))
        conn.commit()
        # 记录 input-request Step（供前端展示）
        seq = conn.execute(
            "SELECT COALESCE(MAX(sequence), 0) + 1 AS s FROM agent_steps WHERE run_id = ?", (run_id,)
        ).fetchone()["s"]
        conn.execute(
            "INSERT INTO agent_steps (id, run_id, sequence, kind, status, title, summary, payload_json, started_at_ms) "
            "VALUES (?, ?, ?, 'input-request', 'waiting', '等待用户输入', ?, ?, ?)",
            (
                db.new_id("stp"),
                run_id,
                seq,
                str(event.payload.get("message") or "需要补充信息"),
                dump_json(event.payload),
                now,
            ),
        )
        conn.commit()
    elif event.event_type == "tool-call-proposed":
        runtime_call_id = str(event.payload.get("runtime_call_id") or "")
        tool_id = str(event.payload.get("tool_id") or "")
        side_effect = str(event.payload.get("side_effect") or "read")
        idempotency_key = str(event.payload.get("idempotency_key") or "")
        # 幂等查重（§16.2）：同 run+call+tool 重放不重复记录
        if idempotency_key:
            dup = conn.execute(
                "SELECT id FROM tool_calls WHERE tool_id = ? AND idempotency_key = ?",
                (tool_id, idempotency_key),
            ).fetchone()
            if dup:
                return
        seq = conn.execute(
            "SELECT COALESCE(MAX(sequence), 0) + 1 AS s FROM agent_steps WHERE run_id = ?", (run_id,)
        ).fetchone()["s"]
        step_id = db.new_id("stp")
        conn.execute(
            "INSERT INTO agent_steps (id, run_id, sequence, kind, status, title, summary, payload_json, started_at_ms) "
            "VALUES (?, ?, ?, 'tool-call', 'proposed', ?, ?, ?, ?)",
            (
                step_id,
                run_id,
                seq,
                str(event.payload.get("name") or tool_id),
                str(event.payload.get("summary") or ""),
                dump_json(event.payload),
                now_ms(),
            ),
        )
        now = now_ms()
        conn.execute(
            "INSERT INTO tool_calls (id, run_id, step_id, runtime_call_id, tool_id, status, side_effect, "
            "arguments_json, idempotency_key, created_at_ms) VALUES (?, ?, ?, ?, ?, 'proposed', ?, ?, ?, ?)",
            (
                db.new_id("tcl"),
                run_id,
                step_id,
                runtime_call_id or None,
                tool_id,
                side_effect,
                dump_json(event.payload.get("arguments") or {}),
                idempotency_key or None,
                now,
            ),
        )
        conn.commit()
    elif event.event_type == "tool-call-result":
        runtime_call_id = str(event.payload.get("runtime_call_id") or "")
        conn.execute(
            "UPDATE tool_calls SET status = 'succeeded', result_summary = ?, result_json = ?, finished_at_ms = ? "
            "WHERE run_id = ? AND (runtime_call_id = ? OR (? = '' AND 1 = 1))",
            (
                str(event.payload.get("summary") or ""),
                dump_json(event.payload.get("result") or {}),
                now_ms(),
                run_id,
                runtime_call_id,
                runtime_call_id,
            ),
        )
        conn.commit()
    elif event.event_type in ("step-started", "step-completed", "diagnostic", "checkpoint", "artifact-proposed"):
        seq = conn.execute(
            "SELECT COALESCE(MAX(sequence), 0) + 1 AS s FROM agent_steps WHERE run_id = ?", (run_id,)
        ).fetchone()["s"]
        conn.execute(
            "INSERT INTO agent_steps (id, run_id, sequence, kind, status, title, summary, payload_json, started_at_ms, finished_at_ms) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                db.new_id("stp"),
                run_id,
                seq,
                event.event_type,
                "completed" if event.event_type in ("step-completed", "checkpoint") else "running",
                str(event.payload.get("title") or ""),
                str(event.payload.get("summary") or ""),
                dump_json(event.payload),
                now_ms(),
                now_ms() if event.event_type in ("step-completed", "checkpoint") else None,
            ),
        )
        conn.commit()


def _finish_succeeded(task_id: str, run_id: str, summary: str) -> None:
    now = now_ms()
    conn = db.get_connection()
    task = _require_task(task_id)
    # 取消竞态保护：任务已 cancel_requested/cancelled 时不再改写为 succeeded（§14.4 取消优先）
    if task["status"] in ("cancel_requested", "cancelled"):
        conn.execute(
            "UPDATE agent_runs SET status = 'cancelled', finished_at_ms = ? WHERE id = ?", (now, run_id)
        )
        conn.commit()
        return
    conn.execute(
        "UPDATE agent_runs SET status = 'succeeded', result_summary = ?, finished_at_ms = ? WHERE id = ?",
        (summary, now, run_id),
    )
    conn.execute(
        "UPDATE agent_tasks SET status = 'succeeded', updated_at_ms = ?, finished_at_ms = ? WHERE id = ?",
        (now, now, task_id),
    )
    _set_session_ready_if_idle(conn, task, now)
    _write_outbox(conn, task.get("project_id"), "agent_task", task_id, "agent.task.succeeded", {"task_id": task_id, "summary": summary})
    conn.commit()


def _finish_failed(task_id: str, run_id: str, error: str) -> None:
    now = now_ms()
    conn = db.get_connection()
    task = _require_task(task_id)
    # 取消竞态保护：已取消的任务不再改写为 failed
    if task["status"] in ("cancel_requested", "cancelled"):
        conn.execute(
            "UPDATE agent_runs SET status = 'cancelled', finished_at_ms = ? WHERE id = ?", (now, run_id)
        )
        conn.commit()
        return
    error_json = dump_json({"message": error})
    conn.execute(
        "UPDATE agent_runs SET status = 'failed', error_json = ?, finished_at_ms = ? WHERE id = ?",
        (error_json, now, run_id),
    )
    conn.execute(
        "UPDATE agent_tasks SET status = 'failed', error_json = ?, updated_at_ms = ?, finished_at_ms = ? WHERE id = ?",
        (error_json, now, now, task_id),
    )
    _set_session_ready_if_idle(conn, task, now)
    _write_outbox(conn, task.get("project_id"), "agent_task", task_id, "agent.task.failed", {"task_id": task_id, "error": error})
    conn.commit()


def _set_session_ready_if_idle(conn, task: Dict[str, Any], now: int) -> None:
    """仅当 Session 无其他活跃 Run 时置 ready（并发 Task 保护，§6.6 状态机）。"""
    active = conn.execute(
        "SELECT COUNT(*) AS c FROM agent_runs r JOIN agent_tasks t ON t.id = r.task_id "
        "WHERE t.session_id = ? AND r.status IN ('queued', 'preparing', 'running', 'waiting_input', 'waiting_permission')",
        (task["session_id"],),
    ).fetchone()["c"]
    if active == 0:
        conn.execute(
            "UPDATE agent_sessions SET status = 'ready', updated_at_ms = ?, last_activity_at_ms = ? WHERE id = ?",
            (now, now, task["session_id"]),
        )


def dispatch_once() -> None:
    """BackgroundTasks 入口：Claim 一个 queued Run 并执行（threadpool 无 loop → asyncio.run）。"""
    conn = db.get_connection()
    row = conn.execute(
        "SELECT id FROM agent_runs WHERE status = 'queued' ORDER BY created_at_ms ASC LIMIT 1"
    ).fetchone()
    if row:
        asyncio.run(dispatch_run(row["id"]))


# ---------- 重启恢复（启动时调用） ----------


def recover_interrupted_runs() -> Dict[str, Any]:
    """服务启动恢复：把 preparing/running/waiting_* 且租约过期的 Run 标 interrupted；
    Task 标 failed（AGENT_RUN_INTERRUPTED，允许 Retry）；Pending Permission 标 cancelled。"""
    conn = db.get_connection()
    now = now_ms()
    interrupted = []
    rows = conn.execute(
        "SELECT * FROM agent_runs WHERE status IN ('preparing', 'running', 'waiting_input', 'waiting_permission') "
        "AND (lease_expires_at_ms IS NULL OR lease_expires_at_ms < ?)",
        (now,),
    ).fetchall()
    for row in rows:
        run = dict(row)
        conn.execute("UPDATE agent_runs SET status = 'interrupted', finished_at_ms = ? WHERE id = ?", (now, run["id"]))
        conn.execute(
            "UPDATE agent_tasks SET status = 'failed', error_json = ?, updated_at_ms = ?, finished_at_ms = ? WHERE id = ?",
            (dump_json({"code": "AGENT_RUN_INTERRUPTED", "message": "服务重启，Run 无法恢复"}), now, now, run["task_id"]),
        )
        conn.execute("UPDATE permission_requests SET status = 'cancelled' WHERE run_id = ? AND status = 'pending'", (run["id"],))
        task = conn.execute("SELECT session_id FROM agent_tasks WHERE id = ?", (run["task_id"],)).fetchone()
        if task:
            conn.execute(
                "UPDATE agent_sessions SET status = 'ready', updated_at_ms = ?, last_activity_at_ms = ? WHERE id = ?",
                (now, now, task["session_id"]),
            )
        interrupted.append(run["id"])
    conn.commit()
    return {"recovered": len(interrupted), "run_ids": interrupted}
