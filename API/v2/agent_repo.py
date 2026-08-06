"""Agent 领域共享仓储：Agent Profile / Revision / Skill 绑定查询与 DTO 组装（B7/B8 共用）。

契约：docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md §6.3/§6.5/§9.2/§9.4
- Agent Profile 软删除；更新创建新 Revision（历史 Run 固定 revision）。
- Skill 绑定唯一（agent_profile_id, skill_id）。
- 时间戳 Epoch 毫秒。
"""

import json
from typing import Any, Dict, List, Optional

from API.v2 import db
from API.v2.problems import ErrorCode, V2Error


def now_ms() -> int:
    import time

    return int(time.time() * 1000)


def load_json(value: Optional[str], fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def dump_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def require_agent(agent_id: str) -> Dict[str, Any]:
    conn = db.get_connection()
    row = conn.execute(
        "SELECT * FROM agent_profiles WHERE id = ? AND deleted_at_ms IS NULL", (agent_id,)
    ).fetchone()
    if row is None:
        raise V2Error(
            code=ErrorCode.AGENT_PROFILE_NOT_FOUND,
            status=404,
            title="Agent not found",
            detail=f"Agent Profile {agent_id} 不存在",
        )
    return dict(row)


def require_skill(skill_id: str) -> Dict[str, Any]:
    conn = db.get_connection()
    row = conn.execute("SELECT * FROM skills WHERE id = ? AND deleted_at_ms IS NULL", (skill_id,)).fetchone()
    if row is None:
        raise V2Error(
            code=ErrorCode.SKILL_NOT_FOUND,
            status=404,
            title="Skill not found",
            detail=f"Skill {skill_id} 不存在",
        )
    return dict(row)


def require_runtime(runtime_id: str) -> Dict[str, Any]:
    conn = db.get_connection()
    row = conn.execute(
        "SELECT * FROM agent_runtime_profiles WHERE id = ? AND deleted_at_ms IS NULL", (runtime_id,)
    ).fetchone()
    if row is None:
        raise V2Error(
            code=ErrorCode.AGENT_RUNTIME_NOT_FOUND,
            status=404,
            title="Runtime not found",
            detail=f"Agent Runtime {runtime_id} 不存在",
        )
    return dict(row)


def latest_revision(agent_id: str) -> Optional[Dict[str, Any]]:
    conn = db.get_connection()
    row = conn.execute(
        "SELECT * FROM agent_profile_revisions WHERE agent_profile_id = ? ORDER BY revision DESC LIMIT 1",
        (agent_id,),
    ).fetchone()
    return dict(row) if row else None


def skill_summary(skill_id: str) -> Dict[str, Any]:
    """SkillSummary DTO（含 active_version / binding_count）。"""
    conn = db.get_connection()
    row = conn.execute("SELECT * FROM skills WHERE id = ? AND deleted_at_ms IS NULL", (skill_id,)).fetchone()
    if row is None:
        return {"id": skill_id, "skill_key": "", "name": skill_id, "description": "", "category": None, "enabled": False}
    row = dict(row)
    active_version = None
    if row["active_version_id"]:
        v = conn.execute("SELECT version FROM skill_versions WHERE id = ?", (row["active_version_id"],)).fetchone()
        active_version = v["version"] if v else None
    binding_count = conn.execute(
        "SELECT COUNT(*) AS c FROM agent_skill_bindings WHERE skill_id = ?", (skill_id,)
    ).fetchone()["c"]
    return {
        "id": row["id"],
        "skill_key": row["skill_key"],
        "name": row["name"],
        "description": row["description"],
        "category": row.get("category"),
        "enabled": bool(row["enabled"]),
        "status": row["status"],
        "active_version": active_version,
        "binding_count": binding_count,
    }


def runtime_summary(runtime_id: str) -> Dict[str, Any]:
    conn = db.get_connection()
    row = conn.execute(
        "SELECT * FROM agent_runtime_profiles WHERE id = ? AND deleted_at_ms IS NULL", (runtime_id,)
    ).fetchone()
    if row is None:
        return {"id": runtime_id, "name": runtime_id, "adapter_type": "unknown", "enabled": False, "status": "unknown"}
    row = dict(row)
    return {
        "id": row["id"],
        "name": row["name"],
        "adapter_type": row["adapter_type"],
        "enabled": bool(row["enabled"]),
        "status": row["status"],
        "default_model": row.get("default_model"),
    }


def binding_detail(binding: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": binding["id"],
        "agent_profile_id": binding["agent_profile_id"],
        "skill": skill_summary(binding["skill_id"]),
        "skill_id": binding["skill_id"],
        "version_constraint": binding["version_constraint"],
        "enabled": bool(binding["enabled"]),
        "priority": binding["priority"],
        "aliases": load_json(binding.get("aliases_json"), []),
        "default_inputs": load_json(binding.get("default_inputs_json"), {}),
        "created_at": binding["created_at_ms"],
        "updated_at": binding["updated_at_ms"],
    }


def list_bindings(agent_id: str) -> List[Dict[str, Any]]:
    conn = db.get_connection()
    rows = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM agent_skill_bindings WHERE agent_profile_id = ? ORDER BY priority, created_at_ms",
            (agent_id,),
        ).fetchall()
    ]
    return [binding_detail(r) for r in rows]


def agent_dto(agent: Dict[str, Any], with_bindings: bool = True) -> Dict[str, Any]:
    """AgentProfileDetail DTO：summary 字段 + 当前 Revision 内容 + Skill 绑定。"""
    rev = latest_revision(agent["id"])
    dto: Dict[str, Any] = {
        "id": agent["id"],
        "name": agent["name"],
        "slug": agent["slug"],
        "description": agent["description"],
        "icon": agent.get("icon"),
        "enabled": bool(agent["enabled"]),
        "status": agent["status"],
        "runtime_profile": runtime_summary(agent["runtime_profile_id"]),
        "runtime_profile_id": agent["runtime_profile_id"],
        "default_model": agent.get("default_model"),
        "current_revision": agent["current_revision"],
        "created_at": agent["created_at_ms"],
        "updated_at": agent["updated_at_ms"],
    }
    if rev:
        dto["instructions"] = rev["instructions_text"]
        dto["runtime_config"] = load_json(rev.get("runtime_config_json"), {})
        dto["context_policy"] = load_json(rev.get("context_policy_json"), {})
        dto["tool_policy"] = load_json(rev.get("tool_policy_json"), {})
        dto["permission_policy"] = load_json(rev.get("permission_policy_json"), {})
        dto["output_policy"] = load_json(rev.get("output_policy_json"), {})
    else:
        dto.update(
            instructions="",
            runtime_config={},
            context_policy={},
            tool_policy={},
            permission_policy={},
            output_policy={},
        )
    if with_bindings:
        dto["skill_bindings"] = list_bindings(agent["id"])
    return dto


def agent_revision_dto(rev: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": rev["id"],
        "agent_profile_id": rev["agent_profile_id"],
        "revision": rev["revision"],
        "instructions": rev["instructions_text"],
        "runtime_config": load_json(rev.get("runtime_config_json"), {}),
        "context_policy": load_json(rev.get("context_policy_json"), {}),
        "tool_policy": load_json(rev.get("tool_policy_json"), {}),
        "permission_policy": load_json(rev.get("permission_policy_json"), {}),
        "output_policy": load_json(rev.get("output_policy_json"), {}),
        "checksum": rev["checksum"],
        "created_at": rev["created_at_ms"],
    }


def compute_revision_checksum(instructions: str, policies: Dict[str, Any]) -> str:
    import hashlib

    payload = {"instructions": instructions, "policies": policies}
    return hashlib.sha256(dump_json(payload).encode()).hexdigest()


def insert_revision(
    conn,
    agent_id: str,
    revision: int,
    instructions: str,
    policies: Dict[str, Any],
    created_by: Optional[str],
) -> str:
    """创建新的 agent_profile_revisions 行，返回 revision id。"""
    rev_id = db.new_id("afr")
    checksum = compute_revision_checksum(instructions, policies)
    conn.execute(
        "INSERT INTO agent_profile_revisions (id, agent_profile_id, revision, instructions_text, "
        "runtime_config_json, context_policy_json, tool_policy_json, permission_policy_json, output_policy_json, "
        "metadata_json, checksum, created_by, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)",
        (
            rev_id,
            agent_id,
            revision,
            instructions,
            dump_json(policies.get("runtime_config", {})),
            dump_json(policies.get("context_policy", {})),
            dump_json(policies.get("tool_policy", {})),
            dump_json(policies.get("permission_policy", {})),
            dump_json(policies.get("output_policy", {})),
            checksum,
            created_by,
            now_ms(),
        ),
    )
    return rev_id
