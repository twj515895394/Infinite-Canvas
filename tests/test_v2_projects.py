"""Project V2 CRUD 与归档测试。

契约（P0）：项目复用 data/projects.json 存储（保持旧字段兼容），
V2 扩展 revision 乐观锁与归档；PATCH 区分未提供与置 null。
"""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from API.v2.problems import V2Error, api_problem_exception_handler
from API.v2.projects import router as projects_router, set_projects_path


@pytest.fixture()
def client(tmp_path, monkeypatch):
    path = tmp_path / "projects.json"
    # 预置与旧前端兼容的默认项目
    path.write_text(
        json.dumps(
            {
                "projects": [
                    {
                        "id": "default",
                        "name": "默认项目",
                        "order": 0,
                        "created_at": 1000,
                        "updated_at": 1000,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr("API.v2.projects._PROJECTS_PATH", str(path))
    app = FastAPI()
    app.add_exception_handler(V2Error, api_problem_exception_handler)
    app.include_router(projects_router, prefix="/api/v2")
    return TestClient(app), path


def test_create_project_returns_v2_shape(client):
    """创建返回 prj_ 前缀 id、revision=1，且立即出现在列表。"""
    tc, _ = client
    resp = tc.post("/api/v2/projects", json={"name": "新项目"})
    assert resp.status_code == 200
    body = resp.json()["project"]
    assert body["id"].startswith("prj_")
    assert body["name"] == "新项目"
    assert body["revision"] == 1
    listing = tc.get("/api/v2/projects").json()["items"]
    assert any(p["id"] == body["id"] for p in listing)


def test_list_hides_archived_projects(client):
    """归档项目不出现在列表，但详情仍可读（引用不破坏）。"""
    tc, _ = client
    created = tc.post("/api/v2/projects", json={"name": "A"}).json()["project"]
    tc.delete(f"/api/v2/projects/{created['id']}")
    listing = tc.get("/api/v2/projects").json()["items"]
    assert all(p["id"] != created["id"] for p in listing)
    detail = tc.get(f"/api/v2/projects/{created['id']}").json()["project"]
    assert detail["archived"] is True


def test_patch_requires_base_revision_and_conflicts(client):
    """PATCH 不带 base_revision 返回校验错误；带过期 revision 返回 409。"""
    tc, _ = client
    created = tc.post("/api/v2/projects", json={"name": "A"}).json()["project"]
    # 无 base_revision
    resp = tc.patch(f"/api/v2/projects/{created['id']}", json={"name": "B"})
    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION_FAILED"
    # 过期 base_revision
    resp = tc.patch(
        f"/api/v2/projects/{created['id']}",
        json={"name": "B", "base_revision": created["revision"] - 1},
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == "PROJECT_REVISION_CONFLICT"
    # 正确 revision → 成功且递增
    resp = tc.patch(
        f"/api/v2/projects/{created['id']}",
        json={"name": "B", "base_revision": created["revision"]},
    )
    assert resp.status_code == 200
    assert resp.json()["project"]["name"] == "B"
    assert resp.json()["project"]["revision"] == created["revision"] + 1


def test_patch_omitted_field_keeps_value(client):
    """只传 name 时其他字段不变（未提供 ≠ 置 null）。"""
    tc, _ = client
    created = tc.post("/api/v2/projects", json={"name": "A"}).json()["project"]
    resp = tc.patch(
        f"/api/v2/projects/{created['id']}",
        json={"base_revision": created["revision"]},
    )
    assert resp.status_code == 200
    assert resp.json()["project"]["name"] == "A"


def test_restore_brings_project_back(client):
    """restore 恢复归档项目，恢复后重新出现在列表。"""
    tc, _ = client
    created = tc.post("/api/v2/projects", json={"name": "A"}).json()["project"]
    tc.delete(f"/api/v2/projects/{created['id']}")
    resp = tc.post(f"/api/v2/projects/{created['id']}/restore")
    assert resp.status_code == 200
    assert resp.json()["project"]["archived"] is False
    listing = tc.get("/api/v2/projects").json()["items"]
    assert any(p["id"] == created["id"] for p in listing)


def test_not_found_returns_404(client):
    """不存在的项目返回 404 PROJECT_NOT_FOUND。"""
    tc, _ = client
    resp = tc.get("/api/v2/projects/prj_nonexistent")
    assert resp.status_code == 404
    assert resp.json()["code"] == "PROJECT_NOT_FOUND"


def test_default_project_cannot_be_archived(client):
    """默认项目受保护（旧前端依赖其存在），归档返回 422。"""
    tc, _ = client
    resp = tc.delete("/api/v2/projects/default")
    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION_FAILED"


def test_legacy_fields_preserved_in_storage(client):
    """写回 projects.json 保持旧前端字段（id/name/order/created_at/updated_at）完整。"""
    tc, path = client
    created = tc.post("/api/v2/projects", json={"name": "兼容"}).json()["project"]
    data = json.loads(path.read_text(encoding="utf-8"))
    stored = next(p for p in data["projects"] if p["id"] == created["id"])
    for key in ("id", "name", "order", "created_at", "updated_at"):
        assert key in stored
    # 默认项目字段未被破坏
    default = next(p for p in data["projects"] if p["id"] == "default")
    assert default["name"] == "默认项目"
