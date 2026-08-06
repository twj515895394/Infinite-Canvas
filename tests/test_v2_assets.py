"""Asset V2 后端测试（切片 05 B5）。

契约（MVP §11.1 + 切片 05 验收）：
- 四种 ingest 源（upload/remote_url/local_file/shared_folder_file）创建 Asset + 首个 AssetVersion，文件落本地目录。
- AssetVersion 创建后不可变（无修改/删除版本端点，PATCH 资产不影响版本内容）。
- 追加版本创建新版本并更新 current_version_id，历史完整。
- 搜索按名称/描述/标签命中；kind/status/collection 筛选生效；游标分页正确。
- DELETE 进回收站（trashed，列表隐藏）；restore 恢复；purge 存在 Hard Reference（画布节点引用）返回 409 ASSET_IN_USE。
- 不存在资产返回 404 ASSET_NOT_FOUND；PATCH 区分未提供与置 null。
"""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from API.v2 import db
from API.v2.asset_collections import router as collections_router
from API.v2.asset_ingest import set_storage_paths
from API.v2.assets import router as assets_router
from API.v2.problems import V2Error, api_problem_exception_handler


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "default_db_path", lambda: str(tmp_path / "studio.db"))
    db.init_db()
    # 存储目录注入：上传落点 / 本地素材根 / 共享目录注册文件
    # 目录布局对齐真实环境（<root>/assets/input、<root>/assets/uploads）
    input_dir = tmp_path / "assets" / "input"
    local_dir = tmp_path / "assets" / "uploads"
    input_dir.mkdir(parents=True)
    local_dir.mkdir(parents=True)
    set_storage_paths(
        input_dir=str(input_dir),
        local_dir=str(local_dir),
        shared_folders_path=str(tmp_path / "shared_folders.json"),
    )
    app = FastAPI()
    app.add_exception_handler(V2Error, api_problem_exception_handler)
    app.include_router(assets_router, prefix="/api/v2")
    app.include_router(collections_router, prefix="/api/v2")
    return TestClient(app)


def _png_bytes(width: int = 64, height: int = 48) -> bytes:
    """1x 透明 PNG 字节（固定 checksum，便于断言）。"""
    import base64

    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )  # 1x1 PNG


def _register_shared_folder(tmp_path, folder_id: str) -> str:
    path = tmp_path / "shared-root"
    path.mkdir(exist_ok=True)
    registry = tmp_path / "shared_folders.json"
    registry.write_text(json.dumps({"folders": [{"id": folder_id, "path": str(path), "name": "共享"}]}, ensure_ascii=False), encoding="utf-8")
    return str(path)


# ---------- ingest：四种源 ----------


def test_ingest_upload_creates_asset_and_version(client, tmp_path):
    """multipart 上传创建 Asset + v1，kind=image，文件落 input 目录。"""
    resp = client.post(
        "/api/v2/assets/ingest/upload",
        files={"files": ("photo.png", _png_bytes(), "image/png")},
        data={"project_id": "prj_test", "name": "参考图"},
    )
    assert resp.status_code == 200
    asset = resp.json()["assets"][0]
    assert asset["id"].startswith("ast_")
    assert asset["kind"] == "image"
    assert asset["name"] == "参考图"
    assert asset["lifecycle_status"] == "active"
    assert asset["source_type"] == "upload"
    cur = asset["current_version"]
    assert cur["version_no"] == 1
    assert cur["content_url"].startswith("/assets/input/")
    assert cur["mime_type"] == "image/png"
    assert cur["size_bytes"] > 0
    assert cur["checksum"]
    # 文件确实落到本地 input 目录
    files = list((tmp_path / "assets" / "input").iterdir())
    assert len(files) == 1


def test_ingest_remote_url_creates_asset(client, tmp_path, monkeypatch):
    """remote_url 源：下载字节后创建 Asset（下载函数可注入便于测试）。"""
    from API.v2 import asset_ingest as ingest_mod

    monkeypatch.setattr(ingest_mod, "fetch_remote", lambda url: _png_bytes())
    resp = client.post(
        "/api/v2/assets/ingest",
        json={"project_id": "prj_test", "sources": [{"type": "remote_url", "url": "https://example.com/a.png"}]},
    )
    assert resp.status_code == 200
    item = resp.json()["results"][0]
    assert item["status"] == "succeeded"
    asset = item["asset"]
    assert asset["source_type"] == "remote_url"
    assert asset["kind"] == "image"
    assert asset["current_version"]["version_no"] == 1


def test_ingest_local_file_creates_asset(client, tmp_path):
    """local_file 源：从本地素材根复制到 input，创建 Asset。"""
    (tmp_path / "assets" / "uploads" / "local.png").write_bytes(_png_bytes())
    resp = client.post(
        "/api/v2/assets/ingest",
        json={"sources": [{"type": "local_file", "path": "local.png"}]},
    )
    assert resp.status_code == 200
    item = resp.json()["results"][0]
    assert item["status"] == "succeeded"
    assert item["asset"]["source_type"] == "local_file"


def test_ingest_local_file_rejects_escape(client):
    """local_file 路径穿越（../）必须拒绝（该源标记 failed，不创建资产）。"""
    resp = client.post(
        "/api/v2/assets/ingest",
        json={"sources": [{"type": "local_file", "path": "../../etc/passwd"}]},
    )
    assert resp.status_code == 200  # 批量接口按源独立成败
    result = resp.json()["results"][0]
    assert result["status"] == "failed"
    assert result["error"]["code"] == "VALIDATION_FAILED"
    assert resp.json()["assets"] == []


def test_ingest_shared_folder_creates_asset(client, tmp_path):
    """shared_folder_file 源：按注册 ID + 相对路径读取并创建 Asset。"""
    root = _register_shared_folder(tmp_path, "sf_1")
    (tmp_path / "shared-root" / "shot.mp4").write_bytes(b"fake-mp4-bytes")
    resp = client.post(
        "/api/v2/assets/ingest",
        json={"sources": [{"type": "shared_folder_file", "shared_folder_id": "sf_1", "path": "shot.mp4"}]},
    )
    assert resp.status_code == 200
    item = resp.json()["results"][0]
    assert item["status"] == "succeeded"
    assert item["asset"]["kind"] == "video"


def test_ingest_unknown_shared_folder_fails(client):
    """未注册的共享目录返回错误（该源失败，不影响其他源）。"""
    resp = client.post(
        "/api/v2/assets/ingest",
        json={"sources": [{"type": "shared_folder_file", "shared_folder_id": "nope", "path": "a.png"}]},
    )
    assert resp.status_code == 200
    assert resp.json()["results"][0]["status"] == "failed"


# ---------- 版本：追加与不可变 ----------


def test_append_version_updates_current_and_keeps_history(client):
    """追加版本：新版本号递增、current_version_id 更新、历史列表完整。"""
    resp = client.post("/api/v2/assets/ingest/upload", files={"files": ("v1.png", _png_bytes(), "image/png")})
    asset = resp.json()["assets"][0]
    asset_id = asset["id"]
    assert asset["current_version"]["version_no"] == 1

    resp2 = client.post(f"/api/v2/assets/{asset_id}/versions", files={"file": ("v2.png", _png_bytes(), "image/png")})
    assert resp2.status_code == 200
    updated = resp2.json()["asset"]
    assert updated["current_version"]["version_no"] == 2
    assert updated["current_version"]["id"] != asset["current_version"]["id"]

    versions = client.get(f"/api/v2/assets/{asset_id}/versions").json()["versions"]
    assert [v["version_no"] for v in versions] == [2, 1]
    # 历史版本内容未被修改（checksum 与创建时一致）
    assert versions[1]["checksum"] == asset["current_version"]["checksum"]


def test_version_immutable_no_edit_or_delete_endpoints(client):
    """版本内容不可变：不存在修改/删除版本的 API；PATCH 资产元数据不影响版本。"""
    resp = client.post("/api/v2/assets/ingest/upload", files={"files": ("a.png", _png_bytes(), "image/png")})
    asset = resp.json()["assets"][0]
    asset_id = asset["id"]
    version_id = asset["current_version"]["id"]
    # PATCH 元数据（改名/描述）后版本内容不变
    patched = client.patch(f"/api/v2/assets/{asset_id}", json={"name": "新名字", "description": "描述"}).json()["asset"]
    assert patched["name"] == "新名字"
    assert patched["current_version"]["checksum"] == asset["current_version"]["checksum"]
    # 版本信息与 PATCH 前一致
    versions = client.get(f"/api/v2/assets/{asset_id}/versions").json()["versions"]
    assert versions[0]["checksum"] == asset["current_version"]["checksum"]
    # 无版本修改/删除端点（返回 404/405 而非成功）
    assert client.patch(f"/api/v2/assets/{asset_id}/versions/{version_id}", json={"mime_type": "x"}).status_code == 404
    assert client.delete(f"/api/v2/assets/{asset_id}/versions/{version_id}").status_code == 404


# ---------- 回收站 / 恢复 / Purge ----------


def test_trash_hides_and_restore_recovers(client):
    """DELETE 进回收站（列表隐藏、详情仍可解析）；restore 恢复。"""
    resp = client.post("/api/v2/assets/ingest/upload", files={"files": ("a.png", _png_bytes(), "image/png")})
    asset_id = resp.json()["assets"][0]["id"]

    deleted = client.delete(f"/api/v2/assets/{asset_id}")
    assert deleted.status_code == 200
    assert deleted.json()["asset"]["lifecycle_status"] == "trashed"
    # 默认列表隐藏
    ids = [a["id"] for a in client.get("/api/v2/assets").json()["items"]]
    assert asset_id not in ids
    # 回收站可枚举：status=trashed 列出
    trashed_ids = [a["id"] for a in client.get("/api/v2/assets", params={"status": "trashed"}).json()["items"]]
    assert asset_id in trashed_ids
    # 详情仍可解析（引用不破坏）
    detail = client.get(f"/api/v2/assets/{asset_id}").json()["asset"]
    assert detail["lifecycle_status"] == "trashed"
    assert detail["current_version"]["content_url"]  # 引用仍可解析

    restored = client.post(f"/api/v2/assets/{asset_id}/restore")
    assert restored.status_code == 200
    assert restored.json()["asset"]["lifecycle_status"] == "active"
    ids = [a["id"] for a in client.get("/api/v2/assets").json()["items"]]
    assert asset_id in ids


def test_purge_without_reference_deletes(client, tmp_path):
    """无引用的资产 purge 后记录删除、列表不可见、物理文件清理。"""
    resp = client.post("/api/v2/assets/ingest/upload", files={"files": ("a.png", _png_bytes(), "image/png")})
    asset_id = resp.json()["assets"][0]["id"]
    content_url_value = resp.json()["assets"][0]["current_version"]["content_url"]
    stored_name = content_url_value.rsplit("/", 1)[-1]
    stored_path = tmp_path / "assets" / "input" / stored_name
    assert stored_path.is_file()
    resp = client.delete(f"/api/v2/assets/{asset_id}?purge=true")
    assert resp.status_code == 200
    assert client.get(f"/api/v2/assets/{asset_id}").status_code == 404
    assert not stored_path.exists()  # purge 清理磁盘文件


def test_patch_name_null_rejected(client):
    """PATCH name=null 返回 422（不允许置 null），不落库。"""
    resp = client.post("/api/v2/assets/ingest/upload", files={"files": ("a.png", _png_bytes(), "image/png")})
    asset_id = resp.json()["assets"][0]["id"]
    r = client.patch(f"/api/v2/assets/{asset_id}", json={"name": None})
    assert r.status_code == 422
    assert r.json()["code"] == "VALIDATION_FAILED"
    # 名称未被破坏
    assert client.get(f"/api/v2/assets/{asset_id}").json()["asset"]["name"]


def test_ingest_invalid_collection_fails_fast(client):
    """collection_id 非法时整批拒绝（404），不创建任何资产（fail-fast）。"""
    resp = client.post(
        "/api/v2/assets/ingest",
        json={"sources": [{"type": "remote_url", "url": "https://example.com/a.png"}], "collection_id": "col_nope"},
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "RESOURCE_NOT_FOUND"
    assert client.get("/api/v2/assets").json()["items"] == []


def test_purge_with_canvas_reference_conflicts(client):
    """画布节点引用该资产时 purge 返回 409 ASSET_IN_USE。"""
    resp = client.post("/api/v2/assets/ingest/upload", files={"files": ("a.png", _png_bytes(), "image/png")})
    asset_id = resp.json()["assets"][0]["id"]
    # 直接写入一张引用了该资产节点的画布快照
    conn = db.get_connection()
    conn.execute(
        "INSERT INTO canvases (id, project_id, title, revision, status, created_at, updated_at, snapshot_json) "
        "VALUES (?, ?, ?, 1, 'active', 1, 1, ?)",
        (
            "cnv_ref",
            "prj_test",
            "引用画布",
            json.dumps(
                {
                    "nodes": [{"id": "n1", "kind": "asset", "data": {"asset_id": asset_id}, "position": {"x": 0, "y": 0}}],
                    "edges": [],
                }
            ),
        ),
    )
    conn.commit()
    resp = client.delete(f"/api/v2/assets/{asset_id}?purge=true")
    assert resp.status_code == 409
    assert resp.json()["code"] == "ASSET_IN_USE"


# ---------- 搜索 / 筛选 / 分页 ----------


def _seed_assets(client, prefix="img"):
    for i in range(5):
        client.post(
            "/api/v2/assets/ingest/upload",
            files={"files": (f"{prefix}-{i}.png", _png_bytes(), "image/png")},
            data={"name": f"{prefix} 素材 {i}", "tags": json.dumps([f"tag-{i % 2}"])},
        )
    # 一个视频资产
    client.post(
        "/api/v2/assets/ingest/upload",
        files={"files": (f"{prefix}-video.mp4", b"fake-mp4", "video/mp4")},
        data={"name": f"{prefix} 视频", "tags": json.dumps(["video-tag"])},
    )


def test_search_by_name_kind_tag(client):
    """query 按名称命中；kind/tag 筛选生效。"""
    _seed_assets(client, "se")
    # query 名称
    items = client.get("/api/v2/assets", params={"query": "素材 3"}).json()["items"]
    assert len(items) == 1
    assert items[0]["name"] == "se 素材 3"
    # kind 筛选
    items = client.get("/api/v2/assets", params={"kind": "video"}).json()["items"]
    assert len(items) == 1
    assert items[0]["kind"] == "video"
    # tag 筛选
    items = client.get("/api/v2/assets", params={"tag": "tag-0"}).json()["items"]
    assert {a["name"] for a in items} == {"se 素材 0", "se 素材 2", "se 素材 4"}


def test_pagination_cursor(client):
    """游标分页：has_more / next_cursor / total 正确。"""
    _seed_assets(client, "pg")
    first = client.get("/api/v2/assets", params={"limit": 2}).json()
    assert first["page"]["has_more"] is True
    assert first["page"]["next_cursor"]
    assert first["page"]["total"] == 6
    assert len(first["items"]) == 2
    second = client.get("/api/v2/assets", params={"limit": 2, "cursor": first["page"]["next_cursor"]}).json()
    assert len(second["items"]) == 2
    assert second["items"][0]["id"] != first["items"][0]["id"]
    last = client.get("/api/v2/assets", params={"limit": 2, "cursor": second["page"]["next_cursor"]}).json()
    assert last["page"]["has_more"] is False
    assert last["page"]["next_cursor"] is None


def test_collection_filter(client):
    """collection 筛选：只返回属于该 Collection 的资产。"""
    _seed_assets(client, "cf")
    created = client.post("/api/v2/asset-collections", json={"name": "角色素材"}).json()["collection"]
    target = client.get("/api/v2/assets", params={"kind": "image"}).json()["items"][0]
    client.post(f"/api/v2/asset-collections/{created['id']}/members", json={"asset_ids": [target["id"]]})
    items = client.get("/api/v2/assets", params={"collection_id": created["id"]}).json()["items"]
    assert [a["id"] for a in items] == [target["id"]]


# ---------- PATCH：未提供 vs 置 null / 404 ----------


def test_patch_null_vs_absent_tags(client):
    """tags 未提供=不动；tags=null=清空。"""
    resp = client.post(
        "/api/v2/assets/ingest/upload",
        files={"files": ("a.png", _png_bytes(), "image/png")},
        data={"tags": json.dumps(["x", "y"])},
    )
    asset_id = resp.json()["assets"][0]["id"]
    assert set(resp.json()["assets"][0]["tags"]) == {"x", "y"}
    # 未提供 tags：不变
    patched = client.patch(f"/api/v2/assets/{asset_id}", json={"name": "只改名"}).json()["asset"]
    assert set(patched["tags"]) == {"x", "y"}
    # tags=null：清空
    cleared = client.patch(f"/api/v2/assets/{asset_id}", json={"tags": None}).json()["asset"]
    assert cleared["tags"] == []


def test_not_found_returns_404(client):
    """不存在的资产：GET/PATCH/DELETE 返回 404 ASSET_NOT_FOUND。"""
    assert client.get("/api/v2/assets/ast_missing").status_code == 404
    assert client.patch("/api/v2/assets/ast_missing", json={"name": "x"}).status_code == 404
    assert client.delete("/api/v2/assets/ast_missing").status_code == 404
    assert client.get("/api/v2/assets/ast_missing").json()["code"] == "ASSET_NOT_FOUND"


# ---------- Collection CRUD ----------


def test_collection_crud_and_members(client):
    """Collection 创建/改名/成员增删/删除。"""
    created = client.post("/api/v2/asset-collections", json={"name": "参考"}).json()["collection"]
    assert created["id"].startswith("col_")
    assert created["member_count"] == 0

    resp = client.post("/api/v2/assets/ingest/upload", files={"files": ("a.png", _png_bytes(), "image/png")})
    asset_id = resp.json()["assets"][0]["id"]

    added = client.post(f"/api/v2/asset-collections/{created['id']}/members", json={"asset_ids": [asset_id]})
    assert added.status_code == 200
    listed = client.get("/api/v2/asset-collections").json()["collections"]
    assert listed[0]["member_count"] == 1

    renamed = client.patch(f"/api/v2/asset-collections/{created['id']}", json={"name": "参考2"}).json()["collection"]
    assert renamed["name"] == "参考2"

    removed = client.delete(f"/api/v2/asset-collections/{created['id']}/members/{asset_id}")
    assert removed.status_code == 200
    assert client.get("/api/v2/asset-collections").json()["collections"][0]["member_count"] == 0

    deleted = client.delete(f"/api/v2/asset-collections/{created['id']}")
    assert deleted.status_code == 200
    assert client.get("/api/v2/asset-collections").json()["collections"] == []


# ---------- local_url 源（F12 生成结果入库） ----------


def _ingest_module():
    """惰性取 ingest 模块（避免 fixture 循环导入）。"""
    from API.v2 import asset_ingest as mod

    return mod


def test_ingest_local_url_creates_asset(client, tmp_path, monkeypatch):
    """local_url 源：本地输出文件（/assets/... 或 /output/...）复制入库创建 Asset。"""
    out_file = tmp_path / "output" / "gen_1.png"
    out_file.parent.mkdir(parents=True)
    out_file.write_bytes(_png_bytes())
    monkeypatch.setattr(_ingest_module(), "local_url_to_path", lambda url: str(out_file))

    resp = client.post(
        "/api/v2/assets/ingest",
        json={
            "project_id": "prj_test",
            "sources": [{"type": "local_url", "url": "/assets/output/gen_1.png", "name": "生成图1"}],
        },
    )
    assert resp.status_code == 200
    item = resp.json()["results"][0]
    assert item["status"] == "succeeded"
    asset = item["asset"]
    assert asset["kind"] == "image"
    assert asset["name"] == "生成图1"
    assert asset["source_type"] == "local_url"
    assert asset["current_version"]["version_no"] == 1
    assert asset["current_version"]["content_url"].startswith("/assets/input/")
    # 文件确实复制到 input 目录（副本，不移动原输出）
    files = list((tmp_path / "assets" / "input").iterdir())
    assert len(files) == 1
    assert out_file.exists()


def test_ingest_local_url_rejects_missing_file(client, monkeypatch):
    """local_url 源文件不存在：该源标记 failed，不创建资产。"""
    monkeypatch.setattr(_ingest_module(), "local_url_to_path", lambda url: None)
    resp = client.post(
        "/api/v2/assets/ingest",
        json={"sources": [{"type": "local_url", "url": "/assets/output/missing.png"}]},
    )
    assert resp.status_code == 200  # 批量接口按源独立成败
    result = resp.json()["results"][0]
    assert result["status"] == "failed"
    assert result["error"]["code"] == "ASSET_INGEST_FAILED"
    assert resp.json()["assets"] == []


def test_ingest_local_url_rejects_non_local_prefix(client):
    """local_url 源仅接受 /assets/、/output/ 前缀（非本地 URL 拒绝）。"""
    resp = client.post(
        "/api/v2/assets/ingest",
        json={"sources": [{"type": "local_url", "url": "https://example.com/a.png"}]},
    )
    assert resp.status_code == 200
    result = resp.json()["results"][0]
    assert result["status"] == "failed"
    assert result["error"]["code"] == "VALIDATION_FAILED"


def test_ingest_local_url_video_kind(client, tmp_path, monkeypatch):
    """local_url 源带 kind 覆盖：视频 URL 显式 kind=video 时按视频入库。"""
    out_file = tmp_path / "output" / "gen.mp4"
    out_file.parent.mkdir(parents=True)
    out_file.write_bytes(b"fake-mp4-bytes")
    monkeypatch.setattr(_ingest_module(), "local_url_to_path", lambda url: str(out_file))
    resp = client.post(
        "/api/v2/assets/ingest",
        json={"sources": [{"type": "local_url", "url": "/assets/output/gen.mp4", "kind": "video"}]},
    )
    assert resp.status_code == 200
    asset = resp.json()["results"][0]["asset"]
    assert asset["kind"] == "video"
