"""Context 与 Permission 路由（切片 13 B8）。

契约：docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md §10.6/§10.11/§16.4
- context preview：解析引用返回 Pinned 版本预览（不创建可执行 Snapshot——Task Service 权威创建）。
- snapshot 查询：GET /agent-contexts/snapshots/{id}。
- permission-requests：列表/详情/decide（原子条件更新防双点）；grants 列表。
MVP 简化（§9.7 个人使用）：Agent Task 默认策略下大部分操作自动允许，
permission_requests 仅在有 ask 策略且运行时提出权限请求时创建。
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from API.v2 import db
from API.v2.agent_context import REFERENCE_TYPES, get_snapshot_asset_refs, resolve_pinned_versions, snapshot_dto
from API.v2.agent_repo import dump_json, load_json, now_ms
from API.v2.problems import ErrorCode, V2Error

router = APIRouter()


class ContextReferenceRequest(BaseModel):
    reference_type: str
    reference_id: str
    version_ref: Optional[str] = None
    required: bool = False


class AgentContextPreviewRequest(BaseModel):
    project_id: Optional[str] = None
    agent_profile_id: Optional[str] = None
    skill_id: Optional[str] = None
    selection_refs: List[ContextReferenceRequest] = Field(default_factory=list)
    attachment_asset_version_ids: List[str] = Field(default_factory=list)
    message: str = ""
    policy_overrides: Dict[str, Any] = Field(default_factory=dict)


@router.post("/agent-contexts/preview")
def preview_context_v2(payload: AgentContextPreviewRequest) -> Dict:
    """Context 预览：解析引用为 Pinned 版本 + 展示 chips；不创建快照。"""
    refs = [r.model_dump() for r in payload.selection_refs]
    # 附件版本并入资产引用：version_ref 是 avr_*，需反查资产 id 作为 reference_id
    if payload.attachment_asset_version_ids:
        conn = db.get_connection()
        for version_id in payload.attachment_asset_version_ids:
            row = conn.execute("SELECT asset_id FROM asset_versions WHERE id = ?", (version_id,)).fetchone()
            if row is None:
                raise V2Error(
                    code=ErrorCode.AGENT_CONTEXT_INVALID,
                    status=422,
                    title="Asset version not found",
                    detail=f"附件版本不存在：{version_id}",
                )
            refs.append(
                {
                    "reference_type": "asset",
                    "reference_id": row["asset_id"],
                    "version_ref": version_id,
                    "required": False,
                }
            )
    pinned = resolve_pinned_versions(refs)
    chips = [
        {
            "key": f"{r['reference_type']}:{r['reference_id']}",
            "label": r.get("title") or r["reference_id"],
            "reference_type": r["reference_type"],
            "reference_id": r["reference_id"],
            "version_ref": r.get("version_ref"),
            "required": r["required"],
            "removable": True,
        }
        for r in pinned
    ]
    return {
        "chips": chips,
        "asset_count": len([c for c in chips if c["reference_type"] == "asset"]),
        "token_estimate": None,
        "can_submit": True,
        "warnings": [],
        "missing_requirements": [],
    }


@router.get("/agent-contexts/snapshots/{snapshot_id}")
def get_context_snapshot_v2(snapshot_id: str) -> Dict:
    return {"snapshot": snapshot_dto(snapshot_id)}


# ---------- Permission（MVP 简化） ----------


class PermissionDecisionRequest(BaseModel):
    decision: str = Field(pattern="^(allow|deny)$")
    scope: str = Field(default="once", pattern="^(once|session|project)$")
    comment: str = ""


def _require_permission(request_id: str) -> Dict[str, Any]:
    conn = db.get_connection()
    row = conn.execute("SELECT * FROM permission_requests WHERE id = ?", (request_id,)).fetchone()
    if row is None:
        raise V2Error(
            code=ErrorCode.PERMISSION_REQUIRED,
            status=404,
            title="Permission request not found",
            detail=f"Permission Request {request_id} 不存在",
        )
    return dict(row)


@router.get("/permission-requests")
def list_permission_requests_v2(status: Optional[str] = None, limit: int = 50) -> Dict:
    limit = max(1, min(200, limit))
    where = ""
    params: List[Any] = []
    if status:
        where = " WHERE status = ?"
        params.append(status)
    conn = db.get_connection()
    rows = [
        dict(r)
        for r in conn.execute(
            f"SELECT * FROM permission_requests{where} ORDER BY created_at_ms DESC LIMIT ?", [*params, limit]
        ).fetchall()
    ]
    return {"items": [permission_dto(r) for r in rows]}


@router.get("/permission-requests/{request_id}")
def get_permission_request_v2(request_id: str) -> Dict:
    return {"permission_request": permission_dto(_require_permission(request_id))}


@router.post("/permission-requests/{request_id}/decide")
def decide_permission_v2(request_id: str, payload: PermissionDecisionRequest) -> Dict:
    """原子条件更新：仅 pending 可决策（防双页面同时点击 → PERMISSION_ALREADY_RESOLVED）。"""
    conn = db.get_connection()
    now = now_ms()
    updated = conn.execute(
        "UPDATE permission_requests SET status = ?, decided_by = 'user', decision_comment = ?, decided_at_ms = ? "
        "WHERE id = ? AND status = 'pending'",
        ("allowed" if payload.decision == "allow" else "denied", payload.comment, now, request_id),
    ).rowcount
    if updated == 0:
        raise V2Error(
            code=ErrorCode.PERMISSION_ALREADY_RESOLVED,
            status=409,
            title="Permission already resolved",
            detail="该权限请求已被处理",
        )
    # scope=session/project 时写持久 Grant
    request = _require_permission(request_id)
    if payload.scope in ("session", "project") and payload.decision == "allow":
        conn.execute(
            "INSERT INTO permission_grants (id, decision, scope, scope_id, agent_profile_id, skill_id, tool_id, "
            "permission_key, created_at_ms) VALUES (?, 'allow', ?, ?, ?, ?, ?, ?, ?)",
            (
                db.new_id("pgr"),
                payload.scope,
                request.get("project_id") or request["agent_profile_id"],
                request.get("agent_profile_id"),
                request.get("skill_id"),
                request.get("tool_call_id"),
                request["permission_key"],
                now,
            ),
        )
    conn.commit()
    return {"permission_request": permission_dto(_require_permission(request_id))}


@router.get("/permission-grants")
def list_permission_grants_v2(limit: int = 50) -> Dict:
    limit = max(1, min(200, limit))
    conn = db.get_connection()
    rows = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM permission_grants WHERE revoked_at_ms IS NULL ORDER BY created_at_ms DESC LIMIT ?",
            (limit,),
        ).fetchall()
    ]
    return {
        "items": [
            {
                "id": r["id"],
                "decision": r["decision"],
                "scope": r["scope"],
                "scope_id": r["scope_id"],
                "permission_key": r["permission_key"],
                "created_at": r["created_at_ms"],
            }
            for r in rows
        ]
    }


def permission_dto(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "run_id": row["run_id"],
        "tool_call_id": row.get("tool_call_id"),
        "agent_profile_id": row["agent_profile_id"],
        "skill_id": row.get("skill_id"),
        "project_id": row.get("project_id"),
        "permission_key": row["permission_key"],
        "risk_level": row["risk_level"],
        "status": row["status"],
        "requested_scope": row["requested_scope"],
        "summary": row["summary"],
        "impact": load_json(row.get("impact_json"), {}),
        "arguments_preview": load_json(row.get("arguments_preview_json"), {}),
        "reversible": bool(row["reversible"]),
        "paid_action": bool(row["paid_action"]),
        "created_at": row["created_at_ms"],
        "decided_at": row.get("decided_at_ms"),
    }


def create_permission_request(
    run_id: str,
    agent_profile_id: str,
    permission_key: str,
    risk_level: str,
    summary: str,
    tool_call_id: Optional[str] = None,
    skill_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> str:
    """创建 Permission Request（供 Dispatcher/Tool Gateway 使用）。"""
    conn = db.get_connection()
    request_id = db.new_id("prq")
    conn.execute(
        "INSERT INTO permission_requests (id, run_id, tool_call_id, agent_profile_id, skill_id, project_id, "
        "permission_key, risk_level, status, requested_scope, summary, created_at_ms) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'once', ?, ?)",
        (request_id, run_id, tool_call_id, agent_profile_id, skill_id, project_id, permission_key, risk_level, summary, now_ms()),
    )
    conn.commit()
    return request_id
