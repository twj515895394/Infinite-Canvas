"""Asset V2 仓储层：读取、DTO 组装与引用扫描（切片 05 B5）。

职责：
- 资产/版本行读取与 DTO 序列化（AssetSummary / AssetDetail / AssetVersionSummary）。
- 标签全量替换（写）。
- 画布 Hard Reference 扫描（purge 检查）与引用计数。
- 对外 URL 生成（content_url / preview_url）。

不持有 HTTP 路由；供 assets.py（路由）与 asset_ingest.py（写路径）复用。
"""

import json
import os
import time
import urllib.parse
from typing import Any, Dict, List, Optional

from API.v2 import db
from API.v2.problems import ErrorCode, V2Error


def now_ms() -> int:
    return int(time.time() * 1000)


def content_url(filename: str, input_dir: str) -> str:
    """对外 /assets/... URL（等价 main.py output_url_for(filename, "input")）。"""
    folder = input_dir
    rel = str(filename or "").replace("\\", "/").lstrip("/")
    try:
        asset_rel = os.path.relpath(os.path.join(folder, rel), os.path.dirname(folder)).replace("\\", "/")
        if not asset_rel.startswith("../") and asset_rel != "..":
            return f"/assets/{urllib.parse.quote(asset_rel, safe='/')}"
    except Exception:
        pass
    return f"/api/storage-files/upload/{urllib.parse.quote(rel, safe='/')}"


def preview_url(content_url_value: str, kind: str) -> Optional[str]:
    """图片复用现有 /api/media-preview 缩略能力；其他类型第一版无预览。"""
    if kind == "image" and content_url_value:
        return f"/api/media-preview?url={urllib.parse.quote(content_url_value, safe='')}&w=512"
    return None


def fetch_asset(asset_id: str) -> Optional[Dict[str, Any]]:
    conn = db.get_connection()
    row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
    return dict(row) if row else None


def require_asset(asset_id: str) -> Dict[str, Any]:
    asset = fetch_asset(asset_id)
    # purged 资产对外不可见（记录保留用于审计），统一按 404 处理
    if asset is None or asset.get("lifecycle_status") == "purged":
        raise V2Error(
            code=ErrorCode.ASSET_NOT_FOUND,
            status=404,
            title="Asset not found",
            detail=f"资产 {asset_id} 不存在",
        )
    return asset


def replace_tags(conn, asset_id: str, tags: Optional[List[str]]) -> None:
    """全量替换资产标签（upsert 标签 + 重建关联）。"""
    conn.execute("DELETE FROM asset_tag_links WHERE asset_id = ?", (asset_id,))
    for raw in tags or []:
        name = str(raw or "").strip()
        if not name:
            continue
        norm = name.lower()
        row = conn.execute("SELECT id FROM asset_tags WHERE normalized_name = ?", (norm,)).fetchone()
        if row:
            tag_id = row[0]
        else:
            tag_id = db.new_id("tag")
            conn.execute(
                "INSERT INTO asset_tags (id, name, normalized_name, created_at) VALUES (?, ?, ?, ?)",
                (tag_id, name, norm, now_ms()),
            )
        conn.execute(
            "INSERT OR IGNORE INTO asset_tag_links (asset_id, tag_id, created_at) VALUES (?, ?, ?)",
            (asset_id, tag_id, now_ms()),
        )


def reference_count(asset_id: str) -> int:
    """P0 最小引用统计：扫描画布快照中引用该资产的节点（Agent 引用表后续阶段补充）。"""
    conn = db.get_connection()
    try:
        rows = conn.execute("SELECT snapshot_json FROM canvases").fetchall()
    except Exception:
        return 0
    count = 0
    for row in rows:
        try:
            state = json.loads(row["snapshot_json"])
        except Exception:
            continue
        for node in state.get("nodes") or []:
            data = node.get("data") or {}
            domain = node.get("domain_ref") or {}
            if (
                isinstance(domain, dict) and domain.get("id") == asset_id
                or data.get("asset_id") == asset_id
                or data.get("asset_version_id") == asset_id
            ):
                count += 1
    return count


def find_hard_references(asset_id: str) -> List[Dict[str, Any]]:
    """purge 前的 Hard Reference 检查：画布节点绑定（domain_ref / data.asset_id / data.asset_version_id）。"""
    conn = db.get_connection()
    try:
        rows = conn.execute("SELECT id, snapshot_json FROM canvases").fetchall()
    except Exception:
        return []
    refs: List[Dict[str, Any]] = []
    for row in rows:
        try:
            state = json.loads(row["snapshot_json"])
        except Exception:
            continue
        for node in state.get("nodes") or []:
            data = node.get("data") or {}
            domain = node.get("domain_ref") or {}
            if (
                isinstance(domain, dict) and domain.get("id") == asset_id
                or data.get("asset_id") == asset_id
                or data.get("asset_version_id") == asset_id
            ):
                refs.append({"canvas_id": row["id"], "node_id": node.get("id")})
    return refs


def version_row(version: Dict[str, Any]) -> Dict[str, Any]:
    """AssetVersionSummary DTO。"""
    return {
        "id": version["id"],
        "asset_id": version["asset_id"],
        "version_no": version["version_no"],
        "content_url": version["content_url"],
        "preview_url": version["preview_url"],
        "mime_type": version["mime_type"],
        "size_bytes": version["size_bytes"],
        "width": version["width"],
        "height": version["height"],
        "duration_ms": version["duration_ms"],
        "checksum": version["checksum"],
        "derivation_type": version["derivation_type"],
        "created_at": version["created_at"],
    }


def asset_summaries(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """批量组装 AssetSummary（一次 IN 查询取 tags/collections/current versions，避免 N+1）。"""
    if not rows:
        return []
    conn = db.get_connection()
    ids = [r["id"] for r in rows]
    placeholders = ",".join("?" * len(ids))

    tags: Dict[str, List[str]] = {i: [] for i in ids}
    for row in conn.execute(
        f"SELECT l.asset_id, t.name FROM asset_tag_links l JOIN asset_tags t ON t.id = l.tag_id WHERE l.asset_id IN ({placeholders})",
        ids,
    ):
        tags[row["asset_id"]].append(row["name"])

    collections: Dict[str, List[str]] = {i: [] for i in ids}
    for row in conn.execute(
        f"SELECT m.asset_id, m.collection_id FROM asset_collection_members m WHERE m.asset_id IN ({placeholders})",
        ids,
    ):
        collections[row["asset_id"]].append(row["collection_id"])

    versions: Dict[str, Dict[str, Any]] = {}
    cur_ids = [r["current_version_id"] for r in rows if r["current_version_id"]]
    if cur_ids:
        v_placeholders = ",".join("?" * len(cur_ids))
        for row in conn.execute(
            f"SELECT * FROM asset_versions WHERE id IN ({v_placeholders})",
            cur_ids,
        ):
            versions[row["id"]] = version_row(dict(row))

    items: List[Dict[str, Any]] = []
    for row in rows:
        cur = versions.get(row["current_version_id"])
        items.append(
            {
                "id": row["id"],
                "project_id": row["project_id"],
                "kind": row["kind"],
                "name": row["name"],
                "description": row["description"],
                "source_type": row["source_type"],
                "lifecycle_status": row["lifecycle_status"],
                "review_status": row["review_status"],
                "current_version": cur,
                "tags": tags.get(row["id"], []),
                "collection_ids": collections.get(row["id"], []),
                "reference_count": reference_count(row["id"]),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "revision": row["revision"],
            }
        )
    return items


def asset_detail(asset_id: str) -> Dict[str, Any]:
    """AssetDetail DTO：summary 字段 + 完整版本历史。"""
    asset = require_asset(asset_id)
    conn = db.get_connection()
    versions = [
        version_row(dict(r))
        for r in conn.execute(
            "SELECT * FROM asset_versions WHERE asset_id = ? ORDER BY version_no DESC", (asset_id,)
        )
    ]
    summary = asset_summaries([asset])[0]
    return {**summary, "versions": versions}
