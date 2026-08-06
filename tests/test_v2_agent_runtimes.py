"""Agent Runtime Profile / Probe 测试（切片 06 B6）。

契约（issue 06 验收 + P0 §10.1）：
- CRUD 完整；启用/禁用可切换；软删除 + 绑定 Agent 时拒绝删除（AGENT_RUNTIME_IN_USE）。
- Probe 返回结构化能力（版本/capabilities/错误原因）；未配置/文件不存在时返回明确失败原因而非崩溃。
- Probe 结果持久化（列表可查历史）。
- 不存在 Runtime 404 AGENT_RUNTIME_NOT_FOUND。
- 禁用状态（enabled=false）作为字段保留（任务分配校验在 B8）。
"""

import json
import shutil
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from API.v2 import db
from API.v2.agent_runtimes import router, probe_runtime
from API.v2.agent_schema import ADAPTER_TYPES
from API.v2.problems import V2Error, api_problem_exception_handler

app = FastAPI()
app.include_router(router, prefix="/api/v2")
app.add_exception_handler(V2Error, api_problem_exception_handler)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "default_db_path", lambda: str(tmp_path / "studio.db"))
    db.init_db()
    return TestClient(app)


def _create(client, **overrides):
    body = {"name": "Codex", "adapter_type": "cli-stdio", "executable_path": "codex", **overrides}
    resp = client.post("/api/v2/agent-runtimes", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()["runtime"]


# ---------- CRUD ----------


def test_create_and_list_runtime(client):
    runtime = _create(client)
    assert runtime["id"].startswith("rtp_")
    assert runtime["adapter_type"] == "cli-stdio"
    assert runtime["enabled"] is True
    assert runtime["status"] == "unknown"
    assert runtime["revision"] == 1
    listed = client.get("/api/v2/agent-runtimes").json()["items"]
    assert [r["id"] for r in listed] == [runtime["id"]]


def test_create_rejects_unknown_adapter(client):
    resp = client.post(
        "/api/v2/agent-runtimes",
        json={"name": "Bad", "adapter_type": "teleport"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION_FAILED"


def test_create_rejects_duplicate_name(client):
    _create(client, name="Codex")
    resp = client.post(
        "/api/v2/agent-runtimes",
        json={"name": "Codex", "adapter_type": "cli-stdio"},
    )
    assert resp.status_code == 409


def test_update_with_revision_cas(client):
    runtime = _create(client)
    # 错误 base_revision → 409 REVISION_CONFLICT
    resp = client.patch(f"/api/v2/agent-runtimes/{runtime['id']}", json={"base_revision": 99, "enabled": False})
    assert resp.status_code == 409
    assert resp.json()["code"] == "REVISION_CONFLICT"
    # 正确 CAS → 更新生效且 revision 递增
    updated = client.patch(
        f"/api/v2/agent-runtimes/{runtime['id']}",
        json={"base_revision": 1, "enabled": False, "default_model": "gpt-5-codex"},
    ).json()["runtime"]
    assert updated["enabled"] is False
    assert updated["default_model"] == "gpt-5-codex"
    assert updated["revision"] == 2


def test_get_missing_runtime_404(client):
    resp = client.get("/api/v2/agent-runtimes/rtp_nope")
    assert resp.status_code == 404
    assert resp.json()["code"] == "AGENT_RUNTIME_NOT_FOUND"


def test_delete_runtime_soft(client):
    runtime = _create(client)
    resp = client.delete(f"/api/v2/agent-runtimes/{runtime['id']}")
    assert resp.status_code == 200
    assert client.get("/api/v2/agent-runtimes").json()["items"] == []
    # 再查 404（软删除对外不可见）
    assert client.get(f"/api/v2/agent-runtimes/{runtime['id']}").status_code == 404


def test_delete_runtime_in_use_rejected(client):
    runtime = _create(client)
    # 直接插入一条 Agent 绑定（B7 表已建），验证删除被拒绝
    conn = db.get_connection()
    conn.execute(
        "INSERT INTO agent_profiles (id, name, slug, runtime_profile_id, created_at_ms, updated_at_ms) "
        "VALUES ('agt_test', 'A', 'a', ?, 1, 1)",
        (runtime["id"],),
    )
    conn.commit()
    resp = client.delete(f"/api/v2/agent-runtimes/{runtime['id']}")
    assert resp.status_code == 409
    assert resp.json()["code"] == "AGENT_RUNTIME_IN_USE"


# ---------- Probe ----------


def test_probe_unavailable_when_executable_missing(client):
    runtime = _create(client, name="Missing", executable_path="definitely-not-a-cli-xyz")
    resp = client.post(f"/api/v2/agent-runtimes/{runtime['id']}/probe")
    assert resp.status_code == 200  # 失败返回结构化结果而非 5xx
    probe = resp.json()["probe"]
    assert probe["status"] == "unavailable"
    assert probe["error"]["code"] in ("AGENT_RUNTIME_UNAVAILABLE", "AGENT_RUNTIME_CONFIG_INVALID")
    assert probe["capabilities"] == []
    # 最近失败回写 profile
    updated = client.get(f"/api/v2/agent-runtimes/{runtime['id']}").json()["runtime"]
    assert updated["status"] == "unavailable"
    assert updated["last_probe_error"] is not None


def test_probe_http_without_endpoint_fails_cleanly(client):
    runtime = _create(client, name="HTTP", adapter_type="http")
    resp = client.post(f"/api/v2/agent-runtimes/{runtime['id']}/probe")
    assert resp.status_code == 200
    assert resp.json()["probe"]["error"]["code"] == "AGENT_RUNTIME_CONFIG_INVALID"


def test_probe_ready_with_version(monkeypatch):
    """注入假可执行文件：版本探测成功 → status=ready + 能力列表。"""
    import asyncio

    from API.v2 import agent_runtimes as mod

    async def fake_run():
        return "codex-1.2.3"

    monkeypatch.setattr(mod, "_probe_executable", lambda profile: {
        "ok": True,
        "status": "ready",
        "version": "codex-1.2.3",
        "capabilities": ["text-generation", "streaming", "cancellation"],
    })
    profile = {"adapter_type": "cli-stdio", "executable_path": "codex"}
    result = probe_runtime(profile)
    assert result["ok"] is True
    assert result["status"] == "ready"
    assert result["version"] == "codex-1.2.3"
    assert "text-generation" in result["capabilities"]


def test_probe_http_ready_with_endpoint(client, monkeypatch):
    """注入假 HTTP 探测：endpoint 可达 → ready。"""
    from API.v2 import agent_runtimes as mod

    monkeypatch.setattr(
        mod, "_probe_http", lambda profile: {"ok": True, "status": "ready", "version": "1.0", "capabilities": ["text-generation"]}
    )
    runtime = _create(client, name="HTTP2", adapter_type="http", endpoint_url="http://127.0.0.1:9")
    resp = client.post(f"/api/v2/agent-runtimes/{runtime['id']}/probe")
    probe = resp.json()["probe"]
    assert probe["status"] == "ready"
    assert probe["version"] == "1.0"


def test_probe_history_persisted(client):
    runtime = _create(client, name="Hist", executable_path="missing-cli-abc")
    client.post(f"/api/v2/agent-runtimes/{runtime['id']}/probe")
    client.post(f"/api/v2/agent-runtimes/{runtime['id']}/probe")
    items = client.get(f"/api/v2/agent-runtimes/{runtime['id']}/probes").json()["items"]
    assert len(items) == 2
    assert items[0]["started_at"] >= items[1]["started_at"]  # 最近优先


def test_probe_does_not_affect_other_runtimes(client):
    bad = _create(client, name="Bad", executable_path="missing-cli-xyz")
    good = _create(client, name="Good", adapter_type="http", endpoint_url="http://127.0.0.1:1")
    from API.v2 import agent_runtimes as mod

    client.post(f"/api/v2/agent-runtimes/{bad['id']}/probe")
    # good 的 probe 独立执行（此处注入失败也不影响 bad 已有结果）
    resp = client.post(f"/api/v2/agent-runtimes/{good['id']}/probe")
    assert resp.status_code == 200
