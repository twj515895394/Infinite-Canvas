"""Context Snapshot 构建（切片 13 B8）。

契约：docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md §6.10/§9.6/§14.1
- Task 创建时只存 context_request（引用意图）；Run 启动（preparing）时构建权威 Snapshot：
  把 AssetVersion 解析为 Pinned Version（执行期间资产版本变化不影响本次 Run）。
- context_snapshots 不可变：创建后只新增不修改；Retry original-context 复用原 Snapshot。
- context_references 记录引用（asset/artifact/project/canvas/node），带 version_ref 固定。
- checksum 覆盖全部引用（key 排序 JSON），供幂等/审计。
"""

import hashlib
import json
from typing import Any, Dict, List, Optional

from API.v2 import db
from API.v2.agent_repo import dump_json, now_ms
from API.v2.problems import ErrorCode, V2Error

# 允许的引用类型（MVP：asset/artifact/project/canvas/node）
REFERENCE_TYPES = {"asset", "artifact", "project", "canvas", "node"}


def resolve_pinned_versions(selection_refs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """把 selection_refs 解析为 Pinned 引用：
    - asset 引用固定 version_ref（显式指定或取当前版本）→ Pinned Version。
    - 其他类型保留引用 ID（MVP 不解析领域对象内容）。
    解析失败（资产不存在）抛 AGENT_CONTEXT_INVALID。
    """
    conn = db.get_connection()
    pinned: List[Dict[str, Any]] = []
    for index, ref in enumerate(selection_refs):
        ref_type = str(ref.get("reference_type") or "")
        ref_id = str(ref.get("reference_id") or "")
        if not ref_id:
            continue
        version_ref = ref.get("version_ref")
        if ref_type == "asset":
            # 资产版本固定：显式 version_ref 或当前版本
            if not version_ref:
                row = conn.execute("SELECT current_version_id FROM assets WHERE id = ? AND lifecycle_status != 'purged'", (ref_id,)).fetchone()
                if row is None or not row["current_version_id"]:
                    raise V2Error(
                        code=ErrorCode.AGENT_CONTEXT_INVALID,
                        status=422,
                        title="Asset not found",
                        detail=f"上下文引用的资产不存在或无版本：{ref_id}",
                    )
                version_ref = row["current_version_id"]
            else:
                v = conn.execute("SELECT id FROM asset_versions WHERE id = ? AND asset_id = ?", (version_ref, ref_id)).fetchone()
                if v is None:
                    raise V2Error(
                        code=ErrorCode.AGENT_CONTEXT_INVALID,
                        status=422,
                        title="Asset version not found",
                        detail=f"上下文引用的资产版本不存在：{version_ref}",
                    )
        elif ref_type not in REFERENCE_TYPES:
            continue  # 未知类型忽略（MVP 宽容）
        pinned.append(
            {
                "sequence": index,
                "reference_type": ref_type,
                "reference_id": ref_id,
                "version_ref": version_ref,
                "required": bool(ref.get("required")),
                "title": str(ref.get("title") or ""),
            }
        )
    return pinned


def snapshot_checksum(pinned: List[Dict[str, Any]], policy: Dict[str, Any]) -> str:
    payload = {"references": pinned, "policy": policy}
    return hashlib.sha256(dump_json(payload).encode()).hexdigest()


def create_snapshot(
    task_id: str,
    run_id: Optional[str],
    project_id: Optional[str],
    selection_refs: List[Dict[str, Any]],
    policy: Dict[str, Any],
) -> Dict[str, Any]:
    """创建权威 Context Snapshot（Run preparing 阶段调用，同一事务外）。"""
    pinned = resolve_pinned_versions(selection_refs)
    checksum = snapshot_checksum(pinned, policy)
    now = now_ms()
    snapshot_id = db.new_id("ctx")
    conn = db.get_connection()
    conn.execute(
        "INSERT INTO context_snapshots (id, project_id, task_id, run_id, policy_json, asset_count, checksum, created_at_ms) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            snapshot_id,
            project_id,
            task_id,
            run_id,
            dump_json(policy),
            len([p for p in pinned if p["reference_type"] == "asset"]),
            checksum,
            now,
        ),
    )
    for ref in pinned:
        conn.execute(
            "INSERT INTO context_references (id, snapshot_id, reference_type, reference_id, version_ref, required, "
            "title, metadata_json, sequence) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?)",
            (
                db.new_id("ctxr"),
                snapshot_id,
                ref["reference_type"],
                ref["reference_id"],
                ref["version_ref"],
                1 if ref["required"] else 0,
                ref["title"],
                ref["sequence"],
            ),
        )
    conn.commit()
    return {"id": snapshot_id, "pinned": pinned, "checksum": checksum}


def snapshot_dto(snapshot_id: str) -> Dict[str, Any]:
    conn = db.get_connection()
    row = conn.execute("SELECT * FROM context_snapshots WHERE id = ?", (snapshot_id,)).fetchone()
    if row is None:
        raise V2Error(
            code=ErrorCode.AGENT_CONTEXT_INVALID,
            status=404,
            title="Snapshot not found",
            detail=f"Context Snapshot {snapshot_id} 不存在",
        )
    row = dict(row)
    refs = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM context_references WHERE snapshot_id = ? ORDER BY sequence", (snapshot_id,)
        ).fetchall()
    ]
    return {
        "id": row["id"],
        "project_id": row.get("project_id"),
        "task_id": row["task_id"],
        "run_id": row.get("run_id"),
        "policy": json.loads(row["policy_json"]) if row["policy_json"] else {},
        "asset_count": row["asset_count"],
        "checksum": row["checksum"],
        "created_at": row["created_at_ms"],
        "references": [
            {
                "id": r["id"],
                "reference_type": r["reference_type"],
                "reference_id": r["reference_id"],
                "version_ref": r.get("version_ref"),
                "required": bool(r["required"]),
                "title": r.get("title"),
                "sequence": r["sequence"],
            }
            for r in refs
        ],
    }


def get_snapshot_asset_refs(snapshot_id: str) -> List[Dict[str, Any]]:
    """返回 Snapshot 中的资产引用（Pinned Version），供 Adapter 组装上下文。"""
    conn = db.get_connection()
    rows = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM context_references WHERE snapshot_id = ? AND reference_type = 'asset' ORDER BY sequence",
            (snapshot_id,),
        ).fetchall()
    ]
    result: List[Dict[str, Any]] = []
    for row in rows:
        version_id = row.get("version_ref")
        version = None
        if version_id:
            v = conn.execute("SELECT * FROM asset_versions WHERE id = ?", (version_id,)).fetchone()
            if v:
                version = {
                    "id": v["id"],
                    "asset_id": v["asset_id"],
                    "version_no": v["version_no"],
                    "content_url": v["content_url"],
                    "mime_type": v["mime_type"],
                }
        result.append(
            {
                "reference_id": row["reference_id"],
                "version": version,
                "title": row.get("title") or "",
                "sequence": row["sequence"],
            }
        )
    return result
