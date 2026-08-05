"""Asset V2 路由层：端点编排（切片 05 B5）。

职责：
- HTTP 端点 + 请求 DTO + 查询参数校验。
- 读写委托给 asset_ingest.py（写/ingest）与 asset_repo.py（读/DTO），本文件不直接拼 SQL。
- 校验错误在端点内手动抛 V2Error（不注册全局 RequestValidationError handler）。

MVP 裁剪（§8.3）：无内容寻址 Blob Store / 物理去重 / Blob GC / Provenance 图谱。
"""

import hashlib
import json
import mimetypes
import os
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel, Field

from API.v2 import db
from API.v2.asset_ingest import (
    MAX_UPLOAD_BYTES,
    AssetIngestRequest,
    ingest_bytes,
    input_dir,
    media_meta,
    resolve_source,
    valid_derivation_type,
)
from API.v2.asset_repo import (
    asset_detail,
    asset_summaries,
    content_url,
    find_hard_references,
    now_ms,
    preview_url,
    replace_tags,
    require_asset,
    version_row,
)
from API.v2.pagination import build_page, page_params
from API.v2.problems import ErrorCode, V2Error

router = APIRouter()

# 允许的排序白名单（防 SQL 注入：只映射到固定 SQL 片段）
_SORTS = {
    "updated_at_desc": "a.updated_at DESC",
    "updated_at_asc": "a.updated_at ASC",
    "created_at_desc": "a.created_at DESC",
    "name_asc": "a.name COLLATE NOCASE ASC",
    "name_desc": "a.name COLLATE NOCASE DESC",
}

_KNOWN_KINDS = frozenset({"image", "video", "audio", "document", "workflow", "archive"})


class AssetPatchRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    project_id: Optional[str] = None


def _parse_tags(raw: str) -> List[str]:
    """表单 tags（JSON 数组字符串）解析；解析失败按单个标签处理。"""
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        return [str(t) for t in parsed] if isinstance(parsed, list) else [str(raw)]
    except json.JSONDecodeError:
        return [raw]


def _add_to_collection(collection_id: str, asset_id: str) -> None:
    """加入集合（幂等）。集合不存在抛 RESOURCE_NOT_FOUND。"""
    _require_collection(collection_id)
    conn = db.get_connection()
    conn.execute(
        "INSERT OR IGNORE INTO asset_collection_members (collection_id, asset_id, sort_order, added_at) VALUES (?, ?, 0, ?)",
        (collection_id, asset_id, now_ms()),
    )
    conn.commit()


@router.get("/assets")
def list_assets_v2(
    project_id: Optional[str] = None,
    kind: Optional[str] = None,
    status: Optional[str] = None,
    tag: Optional[str] = None,
    collection_id: Optional[str] = None,
    query: Optional[str] = None,
    sort: str = "updated_at_desc",
    limit: Optional[int] = None,
    cursor: Optional[str] = None,
) -> Dict:
    """资产列表：游标分页 + 筛选（kind/status/tag/collection/query 名称描述标签）。"""
    limit, offset = page_params(limit, cursor)
    if sort not in _SORTS:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=422,
            title="Invalid sort",
            detail=f"非法排序：{sort}",
            field_errors={"sort": f"must be one of {list(_SORTS)}"},
        )
    if status and status not in ("active", "archived", "trashed"):
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=422,
            title="Invalid status",
            detail=f"非法状态：{status}",
            field_errors={"status": "must be active/archived/trashed"},
        )
    if kind and kind not in _KNOWN_KINDS:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=422,
            title="Invalid kind",
            detail=f"非法类型：{kind}",
            field_errors={"kind": f"must be one of {sorted(_KNOWN_KINDS)}"},
        )

    where = []
    params: List[Any] = []
    # 基础过滤按 status 分支组装：trashed 列出回收站；active/archived 精确匹配；默认隐藏回收站
    if status == "trashed":
        where.append("a.lifecycle_status = 'trashed'")
    elif status in ("active", "archived"):
        where.append("a.lifecycle_status = ?")
        params.append(status)
    else:
        where.append("a.lifecycle_status != 'trashed'")
    if project_id:
        where.append("a.project_id = ?")
        params.append(project_id)
    if kind:
        where.append("a.kind = ?")
        params.append(kind)
    if tag:
        where.append(
            "EXISTS (SELECT 1 FROM asset_tag_links tl JOIN asset_tags tg ON tg.id = tl.tag_id "
            "WHERE tl.asset_id = a.id AND tg.normalized_name = ?)"
        )
        params.append(str(tag).lower())
    if collection_id:
        where.append(
            "EXISTS (SELECT 1 FROM asset_collection_members m WHERE m.asset_id = a.id AND m.collection_id = ?)"
        )
        params.append(collection_id)
    if query:
        q = f"%{str(query).strip()}%"
        where.append(
            "(a.name LIKE ? OR a.description LIKE ? OR EXISTS "
            "(SELECT 1 FROM asset_tag_links tl2 JOIN asset_tags tg2 ON tg2.id = tl2.tag_id "
            "WHERE tl2.asset_id = a.id AND tg2.name LIKE ?))"
        )
        params.extend([q, q, q])

    where_sql = " AND ".join(where)
    conn = db.get_connection()
    total = conn.execute(f"SELECT COUNT(*) FROM assets a WHERE {where_sql}", params).fetchone()[0]
    rows = [
        dict(r)
        for r in conn.execute(
            f"SELECT a.* FROM assets a WHERE {where_sql} ORDER BY {_SORTS[sort]} LIMIT ? OFFSET ?",
            [*params, limit, offset],
        ).fetchall()
    ]
    items = asset_summaries(rows)
    return build_page(items, total, limit, cursor)


@router.post("/assets/ingest")
def ingest_assets_v2(payload: AssetIngestRequest) -> Dict:
    """JSON 导入（remote_url / local_file / shared_folder_file），按源独立成功或失败。"""
    # fail-fast：collection 不存在时整批拒绝，避免资产已落库但响应 failed
    if payload.collection_id:
        _require_collection(payload.collection_id)
    results: List[Dict[str, Any]] = []
    assets: List[Dict[str, Any]] = []
    for index, src in enumerate(payload.sources):
        try:
            content, filename, content_type, source_meta = resolve_source(src)
            asset = ingest_bytes(
                content=content,
                filename=src.name or filename,
                content_type=content_type,
                project_id=payload.project_id,
                name=src.name,
                tags=payload.tags,
                source_type=src.type,
                source_metadata=source_meta,
                kind=src.kind,
            )
            if payload.collection_id:
                _add_to_collection(payload.collection_id, asset["id"])
            assets.append(asset)
            results.append({"source_index": index, "status": "succeeded", "asset": asset})
        except V2Error as exc:
            results.append(
                {
                    "source_index": index,
                    "status": "failed",
                    "error": {"code": exc.code, "title": exc.title, "detail": exc.detail},
                }
            )
    return {"results": results, "assets": assets}


@router.post("/assets/ingest/upload")
def ingest_upload_v2(
    files: List[UploadFile] = File(...),
    project_id: str = Form(""),
    name: str = Form(""),
    tags: str = Form(""),
    collection_id: str = Form(""),
    kind: str = Form(""),
) -> Dict:
    """multipart 上传（对齐旧 /api/ai/upload 形态），按文件独立成败，成功同步创建 Asset + v1。"""
    if collection_id:
        _require_collection(collection_id)
    assets: List[Dict[str, Any]] = []
    for file in files:
        try:
            asset = ingest_bytes(
                content=file.file.read(),
                filename=file.filename or "untitled",
                content_type=file.content_type,
                project_id=project_id or None,
                name=name or None,
                tags=_parse_tags(tags),
                source_type="upload",
                source_metadata={"original_filename": file.filename},
                kind=kind or None,
            )
            if collection_id:
                _add_to_collection(collection_id, asset["id"])
            assets.append(asset)
        except V2Error as exc:
            # 与 JSON 端点一致的按文件独立成败语义：失败项带 error，不影响其余文件
            assets.append({"error": {"code": exc.code, "title": exc.title, "detail": exc.detail}})
    return {"assets": assets}


def _require_collection(collection_id: str) -> None:
    """集合必须存在（404 RESOURCE_NOT_FOUND），供 ingest fail-fast 使用。"""
    conn = db.get_connection()
    exists = conn.execute("SELECT 1 FROM asset_collections WHERE id = ?", (collection_id,)).fetchone()
    if not exists:
        raise V2Error(
            code=ErrorCode.RESOURCE_NOT_FOUND,
            status=404,
            title="Collection not found",
            detail=f"集合 {collection_id} 不存在",
        )


@router.get("/assets/{asset_id}")
def get_asset_v2(asset_id: str) -> Dict:
    return {"asset": asset_detail(asset_id)}


@router.patch("/assets/{asset_id}")
def patch_asset_v2(asset_id: str, payload: AssetPatchRequest) -> Dict:
    """PATCH 元数据（name/description/tags/project_id）。用 model_fields_set 区分未提供与置 null。"""
    asset = require_asset(asset_id)
    fields = payload.model_fields_set
    if not fields:
        return {"asset": asset_detail(asset_id)}
    # name 不允许置 null（DB NOT NULL；与 P0 Contract name min_length=1 一致）
    if "name" in fields and payload.name is None:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=422,
            title="Invalid name",
            detail="name 不能为 null",
            field_errors={"name": "must not be null"},
        )

    now = now_ms()
    conn = db.get_connection()
    updates = []
    params: List[Any] = []
    if "name" in fields:
        updates.append("name = ?")
        params.append(payload.name)
    if "description" in fields:
        updates.append("description = ?")
        params.append(payload.description or "")
    if "project_id" in fields:
        updates.append("project_id = ?")
        params.append(payload.project_id)
    if updates:
        updates.append("updated_at = ?")
        params.append(now)
        params.append(asset_id)
        conn.execute(f"UPDATE assets SET {', '.join(updates)} WHERE id = ?", params)
    if "tags" in fields:
        replace_tags(conn, asset_id, payload.tags)
    if updates or "tags" in fields:
        conn.execute("UPDATE assets SET revision = revision + 1, updated_at = ? WHERE id = ?", (now, asset_id))
    conn.commit()
    return {"asset": asset_detail(asset_id)}


@router.delete("/assets/{asset_id}")
def delete_asset_v2(asset_id: str, purge: bool = False) -> Dict:
    """默认进回收站（trashed，引用仍可解析）；purge=true 物理清除（先检查 Hard Reference）。"""
    require_asset(asset_id)
    now = now_ms()
    conn = db.get_connection()
    if purge:
        refs = find_hard_references(asset_id)
        if refs:
            raise V2Error(
                code=ErrorCode.ASSET_IN_USE,
                status=409,
                title="Asset in use",
                detail=f"资产被 {len(refs)} 个画布节点引用，无法永久删除",
                context={"references": refs},
            )
        # 先收集版本物理文件（相对 input_dir），DB 删除成功后清理磁盘（失败仅记录，不影响事务）
        version_files = [
            r[0]
            for r in conn.execute(
                "SELECT file_path FROM asset_versions WHERE asset_id = ?", (asset_id,)
            ).fetchall()
        ]
        conn.execute(
            "UPDATE assets SET lifecycle_status = 'purged', deleted_at = ?, updated_at = ? WHERE id = ?",
            (now, now, asset_id),
        )
        conn.execute("DELETE FROM asset_tag_links WHERE asset_id = ?", (asset_id,))
        conn.execute("DELETE FROM asset_collection_members WHERE asset_id = ?", (asset_id,))
        conn.execute("DELETE FROM asset_versions WHERE asset_id = ?", (asset_id,))
        conn.commit()
        for rel in version_files:
            try:
                path = os.path.join(input_dir(), rel)
                if os.path.isfile(path):
                    os.remove(path)
            except OSError:
                pass  # 文件清理失败不阻断 purge（孤儿文件由后续 GC 兜底）
        return {"asset": {"id": asset_id, "lifecycle_status": "purged"}}
    conn.execute(
        "UPDATE assets SET lifecycle_status = 'trashed', trashed_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ?",
        (now, now, asset_id),
    )
    conn.commit()
    return {"asset": asset_detail(asset_id)}


@router.post("/assets/{asset_id}/restore")
def restore_asset_v2(asset_id: str) -> Dict:
    require_asset(asset_id)
    conn = db.get_connection()
    conn.execute(
        "UPDATE assets SET lifecycle_status = 'active', trashed_at = NULL, updated_at = ?, revision = revision + 1 WHERE id = ?",
        (now_ms(), asset_id),
    )
    conn.commit()
    return {"asset": asset_detail(asset_id)}


@router.get("/assets/{asset_id}/versions")
def list_asset_versions_v2(asset_id: str) -> Dict:
    require_asset(asset_id)
    conn = db.get_connection()
    versions = [
        version_row(dict(r))
        for r in conn.execute(
            "SELECT * FROM asset_versions WHERE asset_id = ? ORDER BY version_no DESC", (asset_id,)
        )
    ]
    return {"versions": versions}


@router.post("/assets/{asset_id}/versions")
def append_asset_version_v2(
    asset_id: str,
    file: UploadFile = File(...),
    derivation_type: str = Form("original"),
    parent_version_id: str = Form(""),
) -> Dict:
    """追加版本：创建新 AssetVersion（不可变），更新 current_version_id。"""
    asset = require_asset(asset_id)
    content = file.file.read()
    if not content:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=400,
            title="Empty file",
            detail="文件内容为空",
        )
    if len(content) > MAX_UPLOAD_BYTES:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=413,
            title="File too large",
            detail=f"文件超过 {MAX_UPLOAD_BYTES // (1024 * 1024)}MB",
        )
    conn = db.get_connection()
    if parent_version_id:
        existing = conn.execute(
            "SELECT 1 FROM asset_versions WHERE id = ? AND asset_id = ?", (parent_version_id, asset_id)
        ).fetchone()
        if not existing:
            raise V2Error(
                code=ErrorCode.VALIDATION_FAILED,
                status=422,
                title="Invalid parent version",
                detail="parent_version_id 不属于该资产",
            )

    kind = asset["kind"]
    ext = os.path.splitext(file.filename or "")[1].lower() or ".bin"
    stored_name = f"ast_{uuid.uuid4().hex[:12]}{ext}"
    conn = db.get_connection()
    try:
        os.makedirs(input_dir(), exist_ok=True)
        path = os.path.join(input_dir(), stored_name)
        with open(path, "wb") as f:
            f.write(content)
        checksum = hashlib.sha256(content).hexdigest()
        width, height, duration_ms = media_meta(path, kind)

        mime = file.content_type or mimetypes.guess_type(stored_name)[0] or "application/octet-stream"
        now = now_ms()
        max_no = conn.execute(
            "SELECT COALESCE(MAX(version_no), 0) FROM asset_versions WHERE asset_id = ?", (asset_id,)
        ).fetchone()[0]
        version_no = max_no + 1
        version_id = db.new_id("avr")
        url = content_url(stored_name, input_dir())
        conn.execute(
            "INSERT INTO asset_versions (id, asset_id, version_no, file_path, content_url, preview_url, mime_type, "
            "size_bytes, width, height, duration_ms, checksum, source_metadata_json, derivation_type, parent_version_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)",
            (
                version_id,
                asset_id,
                version_no,
                stored_name,
                url,
                preview_url(url, kind),
                mime,
                len(content),
                width,
                height,
                duration_ms,
                checksum,
                valid_derivation_type(derivation_type),
                parent_version_id or None,
                now,
            ),
        )
        conn.execute(
            "UPDATE assets SET current_version_id = ?, updated_at = ?, revision = revision + 1 WHERE id = ?",
            (version_id, now, asset_id),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        try:
            os.remove(path)
        except OSError:
            pass
        raise V2Error(
            code=ErrorCode.ASSET_INGEST_FAILED,
            status=500,
            title="Version creation failed",
            detail="创建版本记录失败",
            retryable=True,
        )
    return {"asset": asset_detail(asset_id)}
