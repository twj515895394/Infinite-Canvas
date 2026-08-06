"""Agent Session 路由（切片 13 B8）。

契约：docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md §6.6/§9.5/§10.5
- Session 创建只建 Studio Session（Runtime 原生 Session 在首个 Task 启动时 Lazy Create）。
- Session 状态机：creating→ready→running→waiting_input/waiting_permission→closing→closed/failed。
- 列表支持 project_id/agent_profile_id/status 过滤 + 游标分页。
- 时间戳 Epoch 毫秒。
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from API.v2 import db
from API.v2.agent_repo import dump_json, load_json, now_ms, require_agent, require_runtime, runtime_summary
from API.v2.pagination import page_params
from API.v2.problems import ErrorCode, V2Error

router = APIRouter()

_SESSION_STATUSES = {"creating", "ready", "running", "waiting_input", "waiting_permission", "closing", "closed", "failed"}


class SessionCreate(BaseModel):
    project_id: Optional[str] = None
    agent_profile_id: str = Field(min_length=1)
    title: str = ""
    workspace: Dict[str, Any] = Field(default_factory=dict)
    context_policy_overrides: Dict[str, Any] = Field(default_factory=dict)


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    context_policy_overrides: Optional[Dict[str, Any]] = None


def _require_session(session_id: str) -> Dict[str, Any]:
    conn = db.get_connection()
    row = conn.execute("SELECT * FROM agent_sessions WHERE id = ?", (session_id,)).fetchone()
    if row is None:
        raise V2Error(
            code=ErrorCode.AGENT_SESSION_NOT_FOUND,
            status=404,
            title="Session not found",
            detail=f"Agent Session {session_id} 不存在",
        )
    return dict(row)


def session_dto(session: Dict[str, Any]) -> Dict[str, Any]:
    conn = db.get_connection()
    agent = conn.execute("SELECT * FROM agent_profiles WHERE id = ?", (session["agent_profile_id"],)).fetchone()
    return {
        "id": session["id"],
        "project_id": session.get("project_id"),
        "agent_profile_id": session["agent_profile_id"],
        "agent_profile": {
            "id": session["agent_profile_id"],
            "name": agent["name"] if agent else session["agent_profile_id"],
            "slug": agent["slug"] if agent else "",
        },
        "agent_profile_revision": session["agent_profile_revision"],
        "runtime_profile": runtime_summary(session["runtime_profile_id"]),
        "runtime_session_id": session.get("runtime_session_id"),
        "title": session["title"],
        "status": session["status"],
        "workspace": load_json(session.get("workspace_json"), {}),
        "context_policy": load_json(session.get("context_policy_json"), {}),
        "revision": session["revision"],
        "created_at": session["created_at_ms"],
        "updated_at": session["updated_at_ms"],
        "last_activity_at": session["last_activity_at_ms"],
        "error": load_json(session.get("error_json"), None),
    }


@router.get("/agent-sessions")
def list_sessions_v2(
    project_id: Optional[str] = None,
    agent_profile_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: Optional[int] = None,
    cursor: Optional[str] = None,
) -> Dict:
    """Session 列表（过滤 + 游标分页，最近活动优先）。"""
    limit, offset = page_params(limit, cursor)
    where: List[str] = []
    params: List[Any] = []
    if project_id:
        where.append("project_id = ?")
        params.append(project_id)
    if agent_profile_id:
        where.append("agent_profile_id = ?")
        params.append(agent_profile_id)
    if status:
        where.append("status = ?")
        params.append(status)
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""
    conn = db.get_connection()
    total = conn.execute(f"SELECT COUNT(*) FROM agent_sessions{where_sql}", params).fetchone()[0]
    rows = [
        dict(r)
        for r in conn.execute(
            f"SELECT * FROM agent_sessions{where_sql} ORDER BY last_activity_at_ms DESC LIMIT ? OFFSET ?",
            [*params, limit, offset],
        ).fetchall()
    ]
    items = [session_dto(r) for r in rows]
    from API.v2.pagination import build_page

    return build_page(items, total, limit, cursor)


@router.post("/agent-sessions")
def create_session_v2(payload: SessionCreate) -> Dict:
    """创建 Session：校验 Agent + Runtime 可用；Runtime 原生 Session Lazy Create（首个 Task 时）。"""
    agent = require_agent(payload.agent_profile_id)
    runtime = require_runtime(agent["runtime_profile_id"])
    if not agent["enabled"]:
        raise V2Error(
            code=ErrorCode.AGENT_PROFILE_DISABLED,
            status=422,
            title="Agent disabled",
            detail=f"Agent {agent['name']} 已禁用",
        )
    if not runtime["enabled"]:
        raise V2Error(
            code=ErrorCode.AGENT_RUNTIME_UNAVAILABLE,
            status=422,
            title="Runtime disabled",
            detail=f"Runtime {runtime['name']} 已禁用",
        )
    now = now_ms()
    session_id = db.new_id("ses")
    conn = db.get_connection()
    conn.execute(
        "INSERT INTO agent_sessions (id, project_id, agent_profile_id, agent_profile_revision, runtime_profile_id, "
        "title, status, workspace_json, context_policy_json, revision, created_at_ms, updated_at_ms, last_activity_at_ms) "
        "VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?, 1, ?, ?, ?)",
        (
            session_id,
            payload.project_id,
            agent["id"],
            agent["current_revision"],
            agent["runtime_profile_id"],
            payload.title.strip(),
            dump_json(payload.workspace),
            dump_json(payload.context_policy_overrides),
            now,
            now,
            now,
        ),
    )
    conn.commit()
    return {"session": session_dto(_require_session(session_id))}


@router.get("/agent-sessions/{session_id}")
def get_session_v2(session_id: str) -> Dict:
    return {"session": session_dto(_require_session(session_id))}


@router.patch("/agent-sessions/{session_id}")
def update_session_v2(session_id: str, payload: SessionUpdate) -> Dict:
    session = _require_session(session_id)
    conn = db.get_connection()
    updates: List[str] = []
    params: List[Any] = []
    if payload.title is not None:
        updates.append("title = ?")
        params.append(payload.title.strip())
    if payload.context_policy_overrides is not None:
        merged = {**load_json(session.get("context_policy_json"), {}), **payload.context_policy_overrides}
        updates.append("context_policy_json = ?")
        params.append(dump_json(merged))
    if updates:
        updates.append("revision = revision + 1")
        updates.append("updated_at_ms = ?")
        updates.append("last_activity_at_ms = ?")
        params.extend([now_ms(), now_ms(), session_id])
        conn.execute(f"UPDATE agent_sessions SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
    return {"session": session_dto(_require_session(session_id))}


@router.post("/agent-sessions/{session_id}/close")
def close_session_v2(session_id: str) -> Dict:
    """关闭 Session（MVP：不调用 Runtime 关闭——Lazy Session 无原生会话）。"""
    session = _require_session(session_id)
    if session["status"] in ("closed", "closing"):
        return {"session": session_dto(session)}
    now = now_ms()
    conn = db.get_connection()
    conn.execute(
        "UPDATE agent_sessions SET status = 'closed', closed_at_ms = ?, updated_at_ms = ?, last_activity_at_ms = ? "
        "WHERE id = ?",
        (now, now, now, session_id),
    )
    conn.commit()
    return {"session": session_dto(_require_session(session_id))}


@router.get("/agent-sessions/{session_id}/messages")
def list_session_messages_v2(session_id: str, limit: int = 100) -> Dict:
    """Session 消息（按 sequence 升序；支持跨 Task 连续会话）。"""
    _require_session(session_id)
    limit = max(1, min(500, limit))
    conn = db.get_connection()
    rows = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM agent_messages WHERE session_id = ? ORDER BY sequence ASC LIMIT ?",
            (session_id, limit),
        ).fetchall()
    ]
    return {
        "items": [
            {
                "id": r["id"],
                "session_id": session_id,
                "task_id": r.get("task_id"),
                "run_id": r.get("run_id"),
                "role": r["role"],
                "kind": r["kind"],
                "content": r.get("content"),
                "metadata": load_json(r.get("metadata_json"), {}),
                "created_at": r["created_at_ms"],
            }
            for r in rows
        ]
    }
