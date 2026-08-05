"""Asset Collection V2：集合 CRUD + 成员管理（切片 05 B5）。

契约（MVP §11.1）：Collection 取代旧 Library/Category 嵌套 JSON；
成员通过 asset_collection_members 关联；smart/system kind 第一版仅预留字段。
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from API.v2 import db
from API.v2.asset_repo import now_ms
from API.v2.problems import ErrorCode, V2Error

router = APIRouter()


def _fetch(collection_id: str) -> Optional[Dict[str, Any]]:
    conn = db.get_connection()
    row = conn.execute(
        "SELECT c.*, (SELECT COUNT(*) FROM asset_collection_members m WHERE m.collection_id = c.id) AS member_count "
        "FROM asset_collections c WHERE c.id = ?",
        (collection_id,),
    ).fetchone()
    return dict(row) if row else None


def _require(collection_id: str) -> Dict[str, Any]:
    collection = _fetch(collection_id)
    if collection is None:
        raise V2Error(
            code=ErrorCode.RESOURCE_NOT_FOUND,
            status=404,
            title="Collection not found",
            detail=f"集合 {collection_id} 不存在",
        )
    return collection


def _serialize(c: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": c["id"],
        "project_id": c["project_id"],
        "name": c["name"],
        "description": c["description"],
        "kind": c["kind"],
        "sort_order": c["sort_order"],
        "member_count": c["member_count"],
        "revision": c["revision"],
        "created_at": c["created_at"],
        "updated_at": c["updated_at"],
    }


class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    project_id: Optional[str] = None
    sort_order: int = 0


class CollectionPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = None
    sort_order: Optional[int] = None


class MembersAdd(BaseModel):
    asset_ids: List[str] = Field(min_length=1, max_length=500)


@router.get("/asset-collections")
def list_collections_v2() -> Dict:
    conn = db.get_connection()
    rows = [
        dict(r)
        for r in conn.execute(
            "SELECT c.*, (SELECT COUNT(*) FROM asset_collection_members m WHERE m.collection_id = c.id) AS member_count "
            "FROM asset_collections c ORDER BY c.sort_order ASC, c.updated_at DESC"
        ).fetchall()
    ]
    return {"collections": [_serialize(r) for r in rows]}


@router.post("/asset-collections")
def create_collection_v2(payload: CollectionCreate) -> Dict:
    collection_id = db.new_id("col")
    now = now_ms()
    conn = db.get_connection()
    conn.execute(
        "INSERT INTO asset_collections (id, project_id, name, description, kind, sort_order, revision, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, 'manual', ?, 1, ?, ?)",
        (collection_id, payload.project_id, payload.name.strip(), payload.description, payload.sort_order, now, now),
    )
    conn.commit()
    return {"collection": _serialize(_require(collection_id))}


@router.patch("/asset-collections/{collection_id}")
def patch_collection_v2(collection_id: str, payload: CollectionPatch) -> Dict:
    _require(collection_id)
    fields = payload.model_fields_set
    if not fields:
        return {"collection": _serialize(_require(collection_id))}
    updates = []
    params: List[Any] = []
    if "name" in fields:
        updates.append("name = ?")
        params.append(payload.name.strip())
    if "description" in fields:
        updates.append("description = ?")
        params.append(payload.description or "")
    if "sort_order" in fields:
        updates.append("sort_order = ?")
        params.append(payload.sort_order)
    updates.append("updated_at = ?")
    updates.append("revision = revision + 1")
    params.append(now_ms())
    params.append(collection_id)
    conn = db.get_connection()
    conn.execute(f"UPDATE asset_collections SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    return {"collection": _serialize(_require(collection_id))}


@router.delete("/asset-collections/{collection_id}")
def delete_collection_v2(collection_id: str) -> Dict:
    collection = _require(collection_id)
    conn = db.get_connection()
    conn.execute("DELETE FROM asset_collection_members WHERE collection_id = ?", (collection_id,))
    conn.execute("DELETE FROM asset_collections WHERE id = ?", (collection_id,))
    conn.commit()
    return {"collection": collection}


@router.post("/asset-collections/{collection_id}/members")
def add_collection_members_v2(collection_id: str, payload: MembersAdd) -> Dict:
    _require(collection_id)
    conn = db.get_connection()
    now = now_ms()
    added = 0
    for asset_id in payload.asset_ids:
        exists = conn.execute("SELECT 1 FROM assets WHERE id = ?", (asset_id,)).fetchone()
        if not exists:
            raise V2Error(
                code=ErrorCode.ASSET_NOT_FOUND,
                status=404,
                title="Asset not found",
                detail=f"资产 {asset_id} 不存在",
            )
        cursor = conn.execute(
            "INSERT OR IGNORE INTO asset_collection_members (collection_id, asset_id, sort_order, added_at) VALUES (?, ?, 0, ?)",
            (collection_id, asset_id, now),
        )
        added += cursor.rowcount
    conn.execute("UPDATE asset_collections SET updated_at = ?, revision = revision + 1 WHERE id = ?", (now, collection_id))
    conn.commit()
    return {"collection": _serialize(_require(collection_id)), "added": added}


@router.delete("/asset-collections/{collection_id}/members/{asset_id}")
def remove_collection_member_v2(collection_id: str, asset_id: str) -> Dict:
    _require(collection_id)
    conn = db.get_connection()
    cursor = conn.execute(
        "DELETE FROM asset_collection_members WHERE collection_id = ? AND asset_id = ?",
        (collection_id, asset_id),
    )
    conn.execute("UPDATE asset_collections SET updated_at = ?, revision = revision + 1 WHERE id = ?", (now_ms(), collection_id))
    conn.commit()
    return {"collection": _serialize(_require(collection_id)), "removed": cursor.rowcount}
