"""Canvas V2 增量持久化测试。

契约（P0）：Operation 批量 ≤200、operation_id 幂等去重、
base_revision 冲突返回 409 CANVAS_REVISION_CONFLICT；
画布状态可从 snapshot 重建（replay 一致）。
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from API.v2 import db
from API.v2.canvases import router as canvases_router
from API.v2.problems import V2Error, api_problem_exception_handler


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "default_db_path", lambda: str(tmp_path / "studio.db"))
    db.init_db()
    app = FastAPI()
    app.add_exception_handler(V2Error, api_problem_exception_handler)
    app.include_router(canvases_router, prefix="/api/v2")
    return TestClient(app)


def _create_canvas(tc, project_id="prj_test"):
    resp = tc.post(f"/api/v2/projects/{project_id}/canvases", json={"title": "画布A"})
    assert resp.status_code == 200
    return resp.json()["canvas"]


def test_create_canvas_returns_empty_state(client):
    """创建画布返回 cnv_ 前缀 id、revision=1、空状态。"""
    tc = client
    canvas = _create_canvas(tc)
    assert canvas["id"].startswith("cnv_")
    assert canvas["revision"] == 1
    assert canvas["state"] == {"nodes": [], "edges": [], "viewport": None, "settings": {}}
    # 列表可见
    listing = tc.get("/api/v2/projects/prj_test/canvases").json()["items"]
    assert any(c["id"] == canvas["id"] for c in listing)


def test_operations_apply_and_revision_advances(client):
    """批量 operations 应用后状态正确、revision 递增。"""
    tc = client
    canvas = _create_canvas(tc)
    ops = {
        "base_revision": 1,
        "operations": [
            {"operation_id": "op-1", "type": "node.create", "node": {"id": "n1", "type": "prompt", "position": {"x": 0, "y": 0}}},
            {"operation_id": "op-2", "type": "edge.create", "edge": {"id": "e1", "source": "n1", "target": "n2"}},
            {"operation_id": "op-3", "type": "viewport.update", "viewport": {"x": 100, "y": 50, "zoom": 1.5}},
        ],
    }
    resp = tc.post(f"/api/v2/canvases/{canvas['id']}/operations", json=ops)
    assert resp.status_code == 200
    body = resp.json()
    assert body["revision"] == 2
    assert body["applied"] == 3
    detail = tc.get(f"/api/v2/canvases/{canvas['id']}").json()["canvas"]
    assert detail["state"]["nodes"] == [{"id": "n1", "type": "prompt", "position": {"x": 0, "y": 0}}]
    assert detail["state"]["edges"] == [{"id": "e1", "source": "n1", "target": "n2"}]
    assert detail["state"]["viewport"] == {"x": 100, "y": 50, "zoom": 1.5}


def test_operations_idempotent_by_operation_id(client):
    """重复提交相同 operation_id 不重复应用（幂等去重）。"""
    tc = client
    canvas = _create_canvas(tc)
    ops = {
        "base_revision": 1,
        "operations": [
            {"operation_id": "op-1", "type": "node.create", "node": {"id": "n1", "type": "prompt", "position": {"x": 0, "y": 0}}},
        ],
    }
    first = tc.post(f"/api/v2/canvases/{canvas['id']}/operations", json=ops)
    assert first.json()["applied"] == 1
    # 同 operation_id 重复提交 → 不重复应用，revision 不变
    second = tc.post(f"/api/v2/canvases/{canvas['id']}/operations", json=ops)
    assert second.status_code == 200
    assert second.json()["applied"] == 0
    assert second.json()["revision"] == 2
    detail = tc.get(f"/api/v2/canvases/{canvas['id']}").json()["canvas"]
    assert len(detail["state"]["nodes"]) == 1  # 没有重复节点


def test_operations_stale_base_revision_conflicts(client):
    """base_revision 过期返回 409 CANVAS_REVISION_CONFLICT。"""
    tc = client
    canvas = _create_canvas(tc)
    tc.post(
        f"/api/v2/canvases/{canvas['id']}/operations",
        json={
            "base_revision": 1,
            "operations": [{"operation_id": "op-1", "type": "node.create", "node": {"id": "n1", "type": "prompt", "position": {"x": 0, "y": 0}}}],
        },
    )
    resp = tc.post(
        f"/api/v2/canvases/{canvas['id']}/operations",
        json={
            "base_revision": 1,  # 已过期（当前为 2）
            "operations": [{"operation_id": "op-2", "type": "viewport.update", "viewport": {"x": 1, "y": 1, "zoom": 1}}],
        },
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == "CANVAS_REVISION_CONFLICT"


def test_operations_batch_over_200_rejected(client):
    """单批超过 200 条返回 422。"""
    tc = client
    canvas = _create_canvas(tc)
    ops = {
        "base_revision": 1,
        "operations": [
            {"operation_id": f"op-{i}", "type": "node.create", "node": {"id": f"n{i}", "type": "prompt", "position": {"x": i, "y": 0}}}
            for i in range(201)
        ],
    }
    resp = tc.post(f"/api/v2/canvases/{canvas['id']}/operations", json=ops)
    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION_FAILED"


def test_snapshot_overwrites_state(client):
    """PUT snapshot 覆盖状态并递增 revision（checkpoint/压缩语义）。"""
    tc = client
    canvas = _create_canvas(tc)
    resp = tc.put(
        f"/api/v2/canvases/{canvas['id']}/snapshot",
        json={"state": {"nodes": [{"id": "snap", "type": "output", "position": {"x": 5, "y": 5}}], "edges": [], "viewport": None, "settings": {}}},
    )
    assert resp.status_code == 200
    assert resp.json()["revision"] == 2
    detail = tc.get(f"/api/v2/canvases/{canvas['id']}").json()["canvas"]
    assert detail["state"]["nodes"] == [{"id": "snap", "type": "output", "position": {"x": 5, "y": 5}}]


def test_patch_meta_and_404(client):
    """PATCH 改名生效；不存在画布返回 404 CANVAS_NOT_FOUND；跨项目列表隔离。"""
    tc = client
    canvas = _create_canvas(tc)
    resp = tc.patch(f"/api/v2/canvases/{canvas['id']}", json={"title": "新名字"})
    assert resp.status_code == 200
    assert resp.json()["canvas"]["title"] == "新名字"
    assert tc.get("/api/v2/canvases/cnv_missing").status_code == 404
    other = tc.get("/api/v2/projects/prj_other/canvases").json()["items"]
    assert all(c["id"] != canvas["id"] for c in other)
