"""Canvas V2：Project 下的画布 CRUD + Operation 增量持久化 + Snapshot。

契约（P0）：Operation 批量 ≤200、operation_id 幂等去重、
base_revision 冲突返回 409 CANVAS_REVISION_CONFLICT；
状态 = snapshot_json（最新 checkpoint），operations 表保留增量历史（审计/幂等）。
"""

import json
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from API.v2 import db
from API.v2.problems import ErrorCode, V2Error

MAX_BATCH = 200

router = APIRouter()

# 允许的 Operation 类型（契约：docs/studio-v2-api-v2-p0-contract-and-openapi-design.md）
OP_TYPES = {
    "node.create",
    "node.update",
    "node.delete",
    "position.update",
    "positions.update",
    "edge.create",
    "edge.update",
    "edge.delete",
    "viewport.update",
    "settings.update",
}


def _now_ms() -> int:
    return int(time.time() * 1000)


def _empty_state() -> Dict[str, Any]:
    return {"nodes": [], "edges": [], "viewport": None, "settings": {}}


def _apply(state: Dict[str, Any], op: Dict[str, Any]) -> None:
    """把单条 Operation 应用到画布状态（原地修改）。"""
    op_type = op["type"]
    if op_type == "node.create":
        state["nodes"].append(op["node"])
    elif op_type == "node.update":
        _replace(state["nodes"], "id", op["node"])
    elif op_type == "node.delete":
        _remove(state["nodes"], "id", op.get("node_id") or op.get("id"))
    elif op_type == "position.update":
        _patch(state["nodes"], "id", op["node_id"], {"position": op["position"]})
    elif op_type == "positions.update":
        for entry in op.get("positions") or []:
            _patch(state["nodes"], "id", entry["node_id"], {"position": entry["position"]})
    elif op_type == "edge.create":
        state["edges"].append(op["edge"])
    elif op_type == "edge.update":
        _replace(state["edges"], "id", op["edge"])
    elif op_type == "edge.delete":
        _remove(state["edges"], "id", op.get("edge_id") or op.get("id"))
    elif op_type == "viewport.update":
        state["viewport"] = op["viewport"]
    elif op_type == "settings.update":
        state["settings"] = {**(state["settings"] or {}), **(op.get("settings") or {})}


def _replace(items: List[Dict], key: str, value: Dict) -> None:
    target = value.get(key)
    for i, item in enumerate(items):
        if item.get(key) == target:
            items[i] = value
            return
    items.append(value)  # update 目标不存在时按 upsert 处理


def _remove(items: List[Dict], key: str, target: Optional[str]) -> None:
    if target is None:
        return
    for i, item in enumerate(items):
        if item.get(key) == target:
            del items[i]
            return


def _patch(items: List[Dict], key: str, target: Optional[str], patch: Dict) -> None:
    if target is None:
        return
    for item in items:
        if item.get(key) == target:
            item.update(patch)
            return


class CanvasCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class Operation(BaseModel):
    operation_id: str = Field(min_length=1, max_length=100)
    type: str
    # 其余字段（node/edge/position/viewport/settings...）透传
    model_config = {"extra": "allow"}


class OperationsBatch(BaseModel):
    base_revision: int
    operations: List[Operation] = Field(min_length=1)


class SnapshotPut(BaseModel):
    state: Dict[str, Any]


class CanvasMetaPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)


def _fetch_canvas(canvas_id: str) -> Optional[Dict[str, Any]]:
    conn = db.get_connection()
    row = conn.execute("SELECT * FROM canvases WHERE id = ?", (canvas_id,)).fetchone()
    return dict(row) if row else None


def _serialize(canvas: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": canvas["id"],
        "project_id": canvas["project_id"],
        "title": canvas["title"],
        "revision": canvas["revision"],
        "status": canvas["status"],
        "created_at": canvas["created_at"],
        "updated_at": canvas["updated_at"],
        "state": json.loads(canvas["snapshot_json"]),
    }


@router.get("/projects/{project_id}/canvases")
def list_canvases_v2(project_id: str) -> Dict:
    conn = db.get_connection()
    rows = conn.execute(
        "SELECT * FROM canvases WHERE project_id = ? AND status != 'trashed' ORDER BY updated_at DESC",
        (project_id,),
    ).fetchall()
    return {"items": [_serialize(dict(r)) for r in rows]}


@router.post("/projects/{project_id}/canvases")
def create_canvas_v2(project_id: str, payload: CanvasCreate) -> Dict:
    canvas_id = db.new_id("cnv")
    now = _now_ms()
    conn = db.get_connection()
    conn.execute(
        "INSERT INTO canvases (id, project_id, title, revision, status, created_at, updated_at, snapshot_json) "
        "VALUES (?, ?, ?, 1, 'active', ?, ?, ?)",
        (canvas_id, project_id, payload.title.strip(), now, now, json.dumps(_empty_state())),
    )
    conn.commit()
    return {"canvas": _serialize(_fetch_canvas(canvas_id))}


@router.get("/canvases/{canvas_id}")
def get_canvas_v2(canvas_id: str) -> Dict:
    canvas = _fetch_canvas(canvas_id)
    if canvas is None:
        raise V2Error(
            code=ErrorCode.CANVAS_NOT_FOUND,
            status=404,
            title="Canvas not found",
            detail=f"画布 {canvas_id} 不存在",
        )
    return {"canvas": _serialize(canvas)}


@router.patch("/canvases/{canvas_id}")
def patch_canvas_meta_v2(canvas_id: str, payload: CanvasMetaPatch) -> Dict:
    canvas = _fetch_canvas(canvas_id)
    if canvas is None:
        raise V2Error(
            code=ErrorCode.CANVAS_NOT_FOUND,
            status=404,
            title="Canvas not found",
            detail=f"画布 {canvas_id} 不存在",
        )
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        return {"canvas": _serialize(canvas)}
    conn = db.get_connection()
    conn.execute(
        "UPDATE canvases SET title = ?, updated_at = ? WHERE id = ?",
        (updates["title"], _now_ms(), canvas_id),
    )
    conn.commit()
    return {"canvas": _serialize(_fetch_canvas(canvas_id))}


@router.post("/canvases/{canvas_id}/operations")
def apply_operations_v2(canvas_id: str, payload: OperationsBatch) -> Dict:
    canvas = _fetch_canvas(canvas_id)
    if canvas is None:
        raise V2Error(
            code=ErrorCode.CANVAS_NOT_FOUND,
            status=404,
            title="Canvas not found",
            detail=f"画布 {canvas_id} 不存在",
        )
    # 手动校验批次大小（返回 ApiProblem，不依赖全局 RequestValidationError handler）
    if not payload.operations or len(payload.operations) > MAX_BATCH:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=422,
            title="Invalid batch size",
            detail=f"每批操作数必须在 1-{MAX_BATCH} 之间",
            field_errors={"operations": f"must be 1..{MAX_BATCH}"},
        )
    current = canvas["revision"]
    conn = db.get_connection()
    # 幂等快路径：整批 operation_id 均已应用过 → 直接返回当前 revision，不判冲突
    existing_ids = {
        row[0]
        for row in conn.execute(
            "SELECT operation_id FROM canvas_operations WHERE canvas_id = ?", (canvas_id,)
        ).fetchall()
    }
    if all(op.operation_id in existing_ids for op in payload.operations):
        return {"canvas_id": canvas_id, "revision": current, "applied": 0}
    if payload.base_revision != current:
        raise V2Error(
            code=ErrorCode.CANVAS_REVISION_CONFLICT,
            status=409,
            title="Revision conflict",
            detail=f"画布已被修改，当前 revision={current}",
            context={"current_revision": current},
        )
    for op in payload.operations:
        if op.type not in OP_TYPES:
            raise V2Error(
                code=ErrorCode.VALIDATION_FAILED,
                status=422,
                title="Unknown operation type",
                detail=f"非法 Operation 类型：{op.type}",
                field_errors={"operations": f"unknown type {op.type}"},
            )

    state = json.loads(canvas["snapshot_json"])
    applied = 0
    now = _now_ms()
    for op in payload.operations:
        op_data = op.model_dump()
        # operation_id 幂等去重：历史中已存在则跳过
        exists = conn.execute(
            "SELECT 1 FROM canvas_operations WHERE canvas_id = ? AND operation_id = ?",
            (canvas_id, op_data["operation_id"]),
        ).fetchone()
        if exists:
            continue
        _apply(state, op_data)
        conn.execute(
            "INSERT INTO canvas_operations (canvas_id, operation_id, base_revision, payload_json, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (canvas_id, op_data["operation_id"], current, json.dumps(op_data, ensure_ascii=False), now),
        )
        applied += 1
    new_revision = current + 1
    conn.execute(
        "UPDATE canvases SET snapshot_json = ?, revision = ?, updated_at = ? WHERE id = ?",
        (json.dumps(state, ensure_ascii=False), new_revision, now, canvas_id),
    )
    conn.commit()
    return {"canvas_id": canvas_id, "revision": new_revision, "applied": applied}


@router.put("/canvases/{canvas_id}/snapshot")
def put_snapshot_v2(canvas_id: str, payload: SnapshotPut) -> Dict:
    canvas = _fetch_canvas(canvas_id)
    if canvas is None:
        raise V2Error(
            code=ErrorCode.CANVAS_NOT_FOUND,
            status=404,
            title="Canvas not found",
            detail=f"画布 {canvas_id} 不存在",
        )
    now = _now_ms()
    new_revision = canvas["revision"] + 1
    conn = db.get_connection()
    conn.execute(
        "UPDATE canvases SET snapshot_json = ?, revision = ?, updated_at = ? WHERE id = ?",
        (json.dumps(payload.state, ensure_ascii=False), new_revision, now, canvas_id),
    )
    conn.execute("DELETE FROM canvas_operations WHERE canvas_id = ?", (canvas_id,))
    conn.commit()
    return {"canvas_id": canvas_id, "revision": new_revision}
