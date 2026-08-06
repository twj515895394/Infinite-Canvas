"""Agent Profile 路由（切片 07 B7）。

契约：docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md §6.3/§9.2/§10.2
- Agent Profile CRUD + 复制 + 启用/禁用（软删除）。
- 更新创建新 Revision（revision CAS；历史 Run 固定 revision 快照）。
- Skill 绑定子资源：GET/POST/PATCH/DELETE /agent-profiles/{agent_id}/skills。
- validate：解析绑定 Skill 与运行时，返回校验摘要（第一版轻量校验）。
- 时间戳 Epoch 毫秒。
"""

import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, Field

from API.v2 import db
from API.v2.agent_repo import (
    agent_dto,
    agent_revision_dto,
    binding_detail,
    dump_json,
    insert_revision,
    latest_revision,
    list_bindings,
    load_json,
    now_ms,
    require_agent,
    require_runtime,
    require_skill,
)
from API.v2.problems import ErrorCode, V2Error

router = APIRouter()


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "agent"


class AgentProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: Optional[str] = Field(default=None, max_length=120)
    description: str = ""
    icon: Optional[str] = None
    runtime_profile_id: str = Field(min_length=1)
    default_model: Optional[str] = None
    instructions: str = ""
    runtime_config: Dict[str, Any] = Field(default_factory=dict)
    context_policy: Dict[str, Any] = Field(default_factory=dict)
    tool_policy: Dict[str, Any] = Field(default_factory=dict)
    permission_policy: Dict[str, Any] = Field(default_factory=dict)
    output_policy: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class AgentProfileUpdate(BaseModel):
    base_revision: int
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    slug: Optional[str] = Field(default=None, max_length=120)
    description: Optional[str] = None
    icon: Optional[str] = None
    runtime_profile_id: Optional[str] = None
    default_model: Optional[str] = None
    instructions: Optional[str] = None
    runtime_config: Optional[Dict[str, Any]] = None
    context_policy: Optional[Dict[str, Any]] = None
    tool_policy: Optional[Dict[str, Any]] = None
    permission_policy: Optional[Dict[str, Any]] = None
    output_policy: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


class SkillBindingCreate(BaseModel):
    skill_id: str = Field(min_length=1)
    version_constraint: str = "*"
    enabled: bool = True
    priority: int = 100
    aliases: List[str] = Field(default_factory=list)
    default_inputs: Dict[str, Any] = Field(default_factory=dict)


class SkillBindingUpdate(BaseModel):
    version_constraint: Optional[str] = None
    enabled: Optional[bool] = None
    priority: Optional[int] = None
    aliases: Optional[List[str]] = None
    default_inputs: Optional[Dict[str, Any]] = None


def _policies_of(payload: Any, base: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """合并更新策略字段：未提供的保留现有值。"""
    current = dict(base or {})
    for key in ("runtime_config", "context_policy", "tool_policy", "permission_policy", "output_policy"):
        value = getattr(payload, key, None)
        if value is not None:
            current[key] = value
    return current


@router.get("/agent-profiles")
def list_agents_v2() -> Dict:
    conn = db.get_connection()
    rows = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM agent_profiles WHERE deleted_at_ms IS NULL ORDER BY updated_at_ms DESC"
        ).fetchall()
    ]
    return {"items": [agent_dto(r) for r in rows]}


@router.post("/agent-profiles")
def create_agent_v2(payload: AgentProfileCreate) -> Dict:
    """创建 Agent Profile + 首个 Revision。slug 唯一（活跃行）。"""
    require_runtime(payload.runtime_profile_id)
    slug = (payload.slug or _slugify(payload.name)).strip()
    conn = db.get_connection()
    dup = conn.execute(
        "SELECT id FROM agent_profiles WHERE slug = ? AND deleted_at_ms IS NULL", (slug,)
    ).fetchone()
    if dup:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=409,
            title="Agent slug exists",
            detail=f"Agent slug 已存在：{slug}",
            field_errors={"slug": "duplicate slug"},
        )
    now = now_ms()
    agent_id = db.new_id("agt")
    policies = {
        "runtime_config": payload.runtime_config,
        "context_policy": payload.context_policy,
        "tool_policy": payload.tool_policy,
        "permission_policy": payload.permission_policy,
        "output_policy": payload.output_policy,
    }
    conn.execute(
        "INSERT INTO agent_profiles (id, name, slug, description, icon, enabled, runtime_profile_id, default_model, "
        "current_revision, status, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'draft', ?, ?)",
        (
            agent_id,
            payload.name.strip(),
            slug,
            payload.description,
            payload.icon,
            1 if payload.enabled else 0,
            payload.runtime_profile_id,
            payload.default_model,
            now,
            now,
        ),
    )
    insert_revision(conn, agent_id, 1, payload.instructions, policies, None)
    conn.commit()
    return {"agent": agent_dto(require_agent(agent_id))}


@router.get("/agent-profiles/{agent_id}")
def get_agent_v2(agent_id: str) -> Dict:
    return {"agent": agent_dto(require_agent(agent_id))}


@router.patch("/agent-profiles/{agent_id}")
def update_agent_v2(agent_id: str, payload: AgentProfileUpdate) -> Dict:
    """更新 Agent Profile：revision CAS + 创建新 Revision。"""
    agent = require_agent(agent_id)
    if agent["current_revision"] != payload.base_revision:
        raise V2Error(
            code=ErrorCode.REVISION_CONFLICT,
            status=409,
            title="Revision conflict",
            detail=f"Agent 已被修改，当前 revision={agent['current_revision']}",
        )
    conn = db.get_connection()
    updates: List[str] = []
    params: List[Any] = []
    if payload.name is not None:
        updates.append("name = ?")
        params.append(payload.name.strip())
    if payload.slug is not None:
        slug = payload.slug.strip()
        dup = conn.execute(
            "SELECT id FROM agent_profiles WHERE slug = ? AND deleted_at_ms IS NULL AND id != ?",
            (slug, agent_id),
        ).fetchone()
        if dup:
            raise V2Error(
                code=ErrorCode.VALIDATION_FAILED,
                status=409,
                title="Agent slug exists",
                detail=f"Agent slug 已存在：{slug}",
                field_errors={"slug": "duplicate slug"},
            )
        updates.append("slug = ?")
        params.append(slug)
    if payload.description is not None:
        updates.append("description = ?")
        params.append(payload.description)
    if payload.icon is not None:
        updates.append("icon = ?")
        params.append(payload.icon)
    if payload.runtime_profile_id is not None:
        require_runtime(payload.runtime_profile_id)
        updates.append("runtime_profile_id = ?")
        params.append(payload.runtime_profile_id)
    if payload.default_model is not None:
        updates.append("default_model = ?")
        params.append(payload.default_model)
    if payload.enabled is not None:
        updates.append("enabled = ?")
        params.append(1 if payload.enabled else 0)
        updates.append("status = ?")
        params.append("ready" if payload.enabled else "disabled")
    # 新 Revision（instructions/策略变更或任意更新都生成，保证历史可追溯）
    prev_rev = latest_revision(agent_id) or {}
    instructions = payload.instructions if payload.instructions is not None else prev_rev.get("instructions_text", "")
    policies = _policies_of(payload, {
        "runtime_config": load_json(prev_rev.get("runtime_config_json"), {}),
        "context_policy": load_json(prev_rev.get("context_policy_json"), {}),
        "tool_policy": load_json(prev_rev.get("tool_policy_json"), {}),
        "permission_policy": load_json(prev_rev.get("permission_policy_json"), {}),
        "output_policy": load_json(prev_rev.get("output_policy_json"), {}),
    })
    new_revision = agent["current_revision"] + 1
    insert_revision(conn, agent_id, new_revision, instructions, policies, None)
    updates.append("current_revision = ?")
    params.append(new_revision)
    updates.append("updated_at_ms = ?")
    params.append(now_ms())
    params.append(agent_id)
    conn.execute(f"UPDATE agent_profiles SET {', '.join(updates)} WHERE id = ? AND deleted_at_ms IS NULL", params)
    conn.commit()
    return {"agent": agent_dto(require_agent(agent_id))}


@router.delete("/agent-profiles/{agent_id}")
def delete_agent_v2(agent_id: str) -> Dict:
    """软删除 Agent Profile（历史 Task/Run 保留，绑定保留但 agent 不可再开新任务）。"""
    agent = require_agent(agent_id)
    now = now_ms()
    conn = db.get_connection()
    conn.execute(
        "UPDATE agent_profiles SET deleted_at_ms = ?, updated_at_ms = ? WHERE id = ?", (now, now, agent_id)
    )
    conn.commit()
    return {"agent": agent_dto({**agent, "deleted_at_ms": now}, with_bindings=False)}


@router.post("/agent-profiles/{agent_id}/duplicate")
def duplicate_agent_v2(agent_id: str) -> Dict:
    """复制 Agent：新名称/slug（追加 -copy），复制当前 Revision 与 Skill 绑定。"""
    agent = require_agent(agent_id)
    rev = latest_revision(agent_id) or {}
    base_name = f"{agent['name']} 副本"
    base_slug = _slugify(f"{agent['slug']}-copy")
    conn = db.get_connection()
    slug = base_slug
    counter = 1
    while conn.execute(
        "SELECT id FROM agent_profiles WHERE slug = ? AND deleted_at_ms IS NULL", (slug,)
    ).fetchone():
        counter += 1
        slug = f"{base_slug}-{counter}"
    now = now_ms()
    new_id = db.new_id("agt")
    conn.execute(
        "INSERT INTO agent_profiles (id, name, slug, description, icon, enabled, runtime_profile_id, default_model, "
        "current_revision, status, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'draft', ?, ?)",
        (
            new_id,
            base_name,
            slug,
            agent["description"],
            agent.get("icon"),
            agent["enabled"],
            agent["runtime_profile_id"],
            agent.get("default_model"),
            now,
            now,
        ),
    )
    policies = {
        "runtime_config": load_json(rev.get("runtime_config_json"), {}),
        "context_policy": load_json(rev.get("context_policy_json"), {}),
        "tool_policy": load_json(rev.get("tool_policy_json"), {}),
        "permission_policy": load_json(rev.get("permission_policy_json"), {}),
        "output_policy": load_json(rev.get("output_policy_json"), {}),
    }
    insert_revision(conn, new_id, 1, rev.get("instructions_text", ""), policies, None)
    for b in conn.execute(
        "SELECT * FROM agent_skill_bindings WHERE agent_profile_id = ?", (agent_id,)
    ).fetchall():
        b = dict(b)
        conn.execute(
            "INSERT INTO agent_skill_bindings (id, agent_profile_id, skill_id, version_constraint, enabled, priority, "
            "aliases_json, default_inputs_json, runtime_overrides_json, created_at_ms, updated_at_ms) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                db.new_id("asb"),
                new_id,
                b["skill_id"],
                b["version_constraint"],
                b["enabled"],
                b["priority"],
                b["aliases_json"],
                b["default_inputs_json"],
                b["runtime_overrides_json"],
                now,
                now,
            ),
        )
    conn.commit()
    return {"agent": agent_dto(require_agent(new_id))}


@router.post("/agent-profiles/{agent_id}/validate")
def validate_agent_v2(agent_id: str) -> Dict:
    """校验 Agent：Runtime 存在且可用 + 绑定 Skill 解析。返回校验摘要。"""
    agent = require_agent(agent_id)
    runtime = require_runtime(agent["runtime_profile_id"])
    warnings: List[Dict[str, str]] = []
    missing: List[Dict[str, str]] = []
    if not runtime["enabled"]:
        warnings.append({"code": "RUNTIME_DISABLED", "message": f"Runtime {runtime['name']} 已禁用"})
    bindings = list_bindings(agent_id)
    for binding in bindings:
        skill = require_skill(binding["skill_id"])
        if not skill["enabled"]:
            warnings.append({"code": "SKILL_DISABLED", "message": f"Skill {skill['name']} 已禁用"})
        if not skill["active_version_id"]:
            missing.append({"code": "SKILL_NO_VERSION", "message": f"Skill {skill['name']} 无激活版本"})
    return {
        "agent_id": agent_id,
        "ok": len(missing) == 0,
        "warnings": warnings,
        "missing_requirements": missing,
    }


# ---------- Skill 绑定 ----------


@router.get("/agent-profiles/{agent_id}/skills")
def list_agent_skills_v2(agent_id: str) -> Dict:
    require_agent(agent_id)
    return {"items": list_bindings(agent_id)}


@router.post("/agent-profiles/{agent_id}/skills")
def bind_skill_v2(agent_id: str, payload: SkillBindingCreate) -> Dict:
    """绑定 Skill 到 Agent（唯一；MVP 简化：绑定独立表管理，不生成新 Profile Revision）。"""
    require_agent(agent_id)
    require_skill(payload.skill_id)
    conn = db.get_connection()
    dup = conn.execute(
        "SELECT id FROM agent_skill_bindings WHERE agent_profile_id = ? AND skill_id = ?",
        (agent_id, payload.skill_id),
    ).fetchone()
    if dup:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=409,
            title="Skill already bound",
            detail="该 Skill 已绑定到此 Agent",
        )
    now = now_ms()
    binding_id = db.new_id("asb")
    conn.execute(
        "INSERT INTO agent_skill_bindings (id, agent_profile_id, skill_id, version_constraint, enabled, priority, "
        "aliases_json, default_inputs_json, runtime_overrides_json, created_at_ms, updated_at_ms) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)",
        (
            binding_id,
            agent_id,
            payload.skill_id,
            payload.version_constraint,
            1 if payload.enabled else 0,
            payload.priority,
            dump_json(payload.aliases),
            dump_json(payload.default_inputs),
            now,
            now,
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM agent_skill_bindings WHERE id = ?", (binding_id,)).fetchone()
    return {"binding": binding_detail(dict(row))}


@router.patch("/agent-profiles/{agent_id}/skills/{binding_id}")
def update_binding_v2(agent_id: str, binding_id: str, payload: SkillBindingUpdate) -> Dict:
    require_agent(agent_id)
    conn = db.get_connection()
    row = conn.execute(
        "SELECT * FROM agent_skill_bindings WHERE id = ? AND agent_profile_id = ?", (binding_id, agent_id)
    ).fetchone()
    if row is None:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=404,
            title="Binding not found",
            detail=f"Skill 绑定 {binding_id} 不存在",
        )
    updates: List[str] = []
    params: List[Any] = []
    for column, value in (
        ("version_constraint", payload.version_constraint),
        ("priority", payload.priority),
    ):
        if value is not None:
            updates.append(f"{column} = ?")
            params.append(value)
    if payload.enabled is not None:
        updates.append("enabled = ?")
        params.append(1 if payload.enabled else 0)
    if payload.aliases is not None:
        updates.append("aliases_json = ?")
        params.append(dump_json(payload.aliases))
    if payload.default_inputs is not None:
        updates.append("default_inputs_json = ?")
        params.append(dump_json(payload.default_inputs))
    updates.append("updated_at_ms = ?")
    params.append(now_ms())
    params.append(binding_id)
    conn.execute(f"UPDATE agent_skill_bindings SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    row = conn.execute("SELECT * FROM agent_skill_bindings WHERE id = ?", (binding_id,)).fetchone()
    return {"binding": binding_detail(dict(row))}


@router.delete("/agent-profiles/{agent_id}/skills/{binding_id}")
def unbind_skill_v2(agent_id: str, binding_id: str) -> Dict:
    require_agent(agent_id)
    conn = db.get_connection()
    row = conn.execute(
        "SELECT * FROM agent_skill_bindings WHERE id = ? AND agent_profile_id = ?", (binding_id, agent_id)
    ).fetchone()
    if row is None:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=404,
            title="Binding not found",
            detail=f"Skill 绑定 {binding_id} 不存在",
        )
    conn.execute("DELETE FROM agent_skill_bindings WHERE id = ?", (binding_id,))
    conn.commit()
    return {"binding": binding_detail(dict(row))}


@router.get("/agent-profiles/{agent_id}/revisions")
def list_agent_revisions_v2(agent_id: str) -> Dict:
    """Revision 历史（新 → 旧）。"""
    require_agent(agent_id)
    conn = db.get_connection()
    rows = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM agent_profile_revisions WHERE agent_profile_id = ? ORDER BY revision DESC",
            (agent_id,),
        ).fetchall()
    ]
    return {"items": [agent_revision_dto(r) for r in rows]}


class AgentTestRequest(BaseModel):
    """Agent 测试运行：复用 Task 执行链路，同步驱动到终态。"""

    message: str = Field(default="你好，请简短自我介绍。", min_length=1, max_length=2000)
    skill_id: Optional[str] = None


@router.post("/agent-profiles/{agent_id}/test")
def test_agent_v2(agent_id: str, payload: AgentTestRequest) -> Dict:
    """测试运行 Agent：创建临时 Session + Task，驱动 Dispatcher 到终态，返回结果或明确失败原因。"""
    import asyncio

    from API.v2.agent_sessions import _require_session
    from API.v2.agent_tasks import AUTO_DISPATCH, dispatch_run, task_dto

    agent = require_agent(agent_id)
    runtime = require_runtime(agent["runtime_profile_id"])
    if not runtime["enabled"]:
        raise V2Error(
            code=ErrorCode.AGENT_RUNTIME_UNAVAILABLE,
            status=422,
            title="Runtime disabled",
            detail=f"Runtime {runtime['name']} 已禁用",
        )
    # 临时 Session（测试专用，标题标记）
    now = now_ms()
    session_id = db.new_id("ses")
    conn = db.get_connection()
    conn.execute(
        "INSERT INTO agent_sessions (id, agent_profile_id, agent_profile_revision, runtime_profile_id, title, status, "
        "created_at_ms, updated_at_ms, last_activity_at_ms) VALUES (?, ?, ?, ?, '测试运行', 'ready', ?, ?, ?)",
        (session_id, agent["id"], agent["current_revision"], agent["runtime_profile_id"], now, now, now),
    )
    conn.commit()
    try:
        task_id = db.new_id("tsk")
        run_id = db.new_id("run")
        task_body = {
            "id": task_id,
            "session_id": session_id,
            "project_id": None,
            "agent_profile_id": agent["id"],
            "requested_skill_id": payload.skill_id,
            "requested_skill_version_constraint": None,
            "message": payload.message.strip(),
            "status": "queued",
            "active_run_id": run_id,
            "context_request_json": "{}",
            "output_policy_json": dump_json({"mode": "message-only"}),
            "permission_policy_json": dump_json({}),
            "source_json": "{}",
            "idempotency_key": None,
            "revision": 1,
            "created_at_ms": now,
            "updated_at_ms": now,
            "finished_at_ms": None,
            "error_json": None,
        }
        conn.execute(
            "INSERT INTO agent_tasks (id, session_id, project_id, agent_profile_id, requested_skill_id, "
            "requested_skill_version_constraint, message, status, active_run_id, context_request_json, output_policy_json, "
            "permission_policy_json, source_json, idempotency_key, revision, created_at_ms, updated_at_ms, finished_at_ms, error_json) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, NULL, NULL)",
            (
                task_id,
                session_id,
                None,
                agent["id"],
                payload.skill_id,
                None,
                payload.message.strip(),
                "queued",
                run_id,
                "{}",
                dump_json({"mode": "message-only"}),
                dump_json({}),
                "{}",
                now,
                now,
            ),
        )
        conn.execute(
            "INSERT INTO agent_runs (id, task_id, attempt, status, runtime_profile_id, agent_profile_revision, "
            "retry_mode, created_at_ms) VALUES (?, ?, 1, 'queued', ?, ?, 'original-context', ?)",
            (run_id, task_id, agent["runtime_profile_id"], agent["current_revision"], now),
        )
        conn.commit()
        old_auto = AUTO_DISPATCH
        import API.v2.agent_tasks as tasks_mod

        tasks_mod.AUTO_DISPATCH = False  # 测试运行同步驱动，避免后台双调度
        try:
            asyncio.run(dispatch_run(run_id))
        finally:
            tasks_mod.AUTO_DISPATCH = old_auto
        task = task_dto(_task_by_id(task_id))
        return {
            "ok": task["status"] == "succeeded",
            "task": task,
            "message": task.get("error", {}).get("message") if task["status"] == "failed" else (task["latest_run"] or {}).get("result_summary"),
        }
    finally:
        conn2 = db.get_connection()
        conn2.execute("UPDATE agent_sessions SET status = 'closed', closed_at_ms = ? WHERE id = ?", (now_ms(), session_id))
        conn2.commit()


def _task_by_id(task_id: str) -> Dict[str, Any]:
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
