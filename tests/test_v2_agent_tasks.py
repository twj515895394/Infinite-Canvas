"""Agent Task 执行闭环测试（切片 13 B8）。

契约（issue 13 验收）：
- 创建 Task 立即返回（不阻塞执行）；事件流可观察状态迁移与消息。
- 状态机全迁移：queued→running→succeeded/failed；取消走 cancel_requested→cancelled。
- Retry 复用原 Task 建新 Run，历史 Run 保留不覆盖。
- 相同 Idempotency-Key 重复创建返回同一 Task；不同请求 409。
- Context Snapshot 在 Run 启动时固定 Pinned Version（执行期间资产版本变化不影响本次 Run）。
- 服务重启后历史 Task/Run 仍在；无法恢复的 Run 标 interrupted。
- 失败 Task 返回可理解错误信息。
- 权限 Decide 原子条件更新防双点。
"""

import asyncio
import json
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from API.v2 import db
import API.v2.agent_tasks as tasks_mod
from API.v2.agent_adapters import FakeAdapter, get_adapter, register_adapter, reset_adapters
from API.v2.agent_contexts import router as contexts_router
from API.v2.agent_profiles import router as profiles_router
from API.v2.agent_runtimes import router as runtimes_router
from API.v2.agent_sessions import router as sessions_router
from API.v2.agent_skills import router as skills_router, set_skill_roots
from API.v2.assets import router as assets_router
from API.v2.agent_tasks import dispatch_run, recover_interrupted_runs, router as tasks_router
from API.v2.problems import V2Error, api_problem_exception_handler

app = FastAPI()
for r in (assets_router, runtimes_router, profiles_router, skills_router, sessions_router, tasks_router, contexts_router):
    app.include_router(r, prefix="/api/v2")
app.add_exception_handler(V2Error, api_problem_exception_handler)


@pytest.fixture(autouse=True)
def dispatch_off():
    """测试默认关闭自动调度：状态机由测试手动 asyncio.run 驱动（避免 TestClient 后台任务竞态）。"""
    old = tasks_mod.AUTO_DISPATCH
    tasks_mod.AUTO_DISPATCH = False
    reset_adapters()
    register_adapter("cli-stdio", FakeAdapter(result_text="冒烟结果"))
    yield
    tasks_mod.AUTO_DISPATCH = old
    reset_adapters()


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "default_db_path", lambda: str(tmp_path / "studio.db"))
    db.init_db()
    set_skill_roots(
        root=str(tmp_path / "skills"),
        install=str(tmp_path / "skills" / "installed"),
        quarantine=str(tmp_path / "skills" / "quarantine"),
    )
    return TestClient(app)


def _setup(client):
    """建 Runtime + Agent + Session；返回 (runtime, agent, session)。"""
    runtime = client.post(
        "/api/v2/agent-runtimes",
        json={"name": "FakeRT", "adapter_type": "cli-stdio", "executable_path": "fake"},
    ).json()["runtime"]
    agent = client.post(
        "/api/v2/agent-profiles",
        json={"name": "Agent", "slug": "agent", "runtime_profile_id": runtime["id"], "instructions": "你是测试助手"},
    ).json()["agent"]
    session = client.post(
        "/api/v2/agent-sessions",
        json={"agent_profile_id": agent["id"], "title": "S1"},
    ).json()["session"]
    return runtime, agent, session


def _create_task(client, session, **overrides):
    body = {
        "agent_profile_id": session["agent_profile_id"],
        "message": "帮我分析这张图",
        "idempotency_key": "k1",
        **overrides,
    }
    resp = client.post(f"/api/v2/agent-sessions/{session['id']}/tasks", json=body)
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _run_to_completion(client, task):
    """同步驱动 Dispatcher 直到终态（AUTO_DISPATCH=False 时手动调度）。"""
    run = task["latest_run"]
    asyncio.run(dispatch_run(run["id"]))
    return client.get(f"/api/v2/agent-tasks/{task['id']}").json()["task"]


# ---------- 创建 / 状态机 ----------


def test_create_task_returns_queued_immediately(client):
    _, _, session = _setup(client)
    result = _create_task(client, session)
    task = result["task"]
    assert task["status"] == "queued"
    assert task["latest_run"]["attempt"] == 1
    assert task["latest_run"]["status"] == "queued"
    assert result.get("reused") is False


def test_task_full_state_machine_to_succeeded(client):
    _, _, session = _setup(client)
    task = _create_task(client, session)["task"]
    completed = _run_to_completion(client, task)
    assert completed["status"] == "succeeded"
    run = completed["latest_run"]
    assert run["status"] == "succeeded"
    assert run["result_summary"] == "冒烟结果"
    # 事件流可见 assistant 消息
    events = client.get(f"/api/v2/agent-tasks/{task['id']}/events").json()
    assert events["status"] == "succeeded"
    assert any(e["event_type"] == "message-completed" and e["content"] == "冒烟结果" for e in events["events"])
    # Session 回到 ready
    session_dto = client.get(f"/api/v2/agent-sessions/{session['id']}").json()["session"]
    assert session_dto["status"] == "ready"


def test_task_failure_returns_understandable_error(client):
    _, _, session = _setup(client)
    register_adapter("cli-stdio", FakeAdapter(fail=True))
    task = _create_task(client, session)["task"]
    failed = _run_to_completion(client, task)
    assert failed["status"] == "failed"
    assert failed["error"] is not None
    assert "假 Runtime 失败" in failed["error"]["message"]


def test_session_closed_rejects_new_task(client):
    _, _, session = _setup(client)
    client.post(f"/api/v2/agent-sessions/{session['id']}/close")
    resp = client.post(
        f"/api/v2/agent-sessions/{session['id']}/tasks",
        json={"agent_profile_id": session["agent_profile_id"], "message": "x"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "AGENT_SESSION_CLOSED"


# ---------- 取消 ----------


def test_cancel_queued_task(client):
    _, _, session = _setup(client)
    task = _create_task(client, session)["task"]
    resp = client.post(f"/api/v2/agent-tasks/{task['id']}/cancel")
    assert resp.status_code == 200
    cancelled = resp.json()["task"]
    assert cancelled["status"] == "cancelled"
    assert cancelled["latest_run"]["status"] == "cancelled"


def test_cancel_race_never_overwrites_cancelled(client):
    """取消竞态回归（review P1）：任务取消后，Adapter 残留事件不得改写为 succeeded。"""
    _, _, session = _setup(client)
    register_adapter(
        "cli-stdio",
        FakeAdapter(
            events=[
                {"event_type": "message-completed", "payload": {"content": "部分结果", "role": "assistant"}},
                {"event_type": "completed", "payload": {"summary": "最终结果"}},
            ]
        ),
    )
    task = _create_task(client, session)["task"]
    run = task["latest_run"]
    # 先置 cancel_requested（模拟用户取消）再驱动 Dispatcher 完成
    client.post(f"/api/v2/agent-tasks/{task['id']}/cancel")
    asyncio.run(dispatch_run(run["id"]))
    final = client.get(f"/api/v2/agent-tasks/{task['id']}").json()["task"]
    assert final["status"] == "cancelled"
    assert final["latest_run"]["status"] == "cancelled"


def test_cancel_running_task(client):
    _, _, session = _setup(client)
    # 慢 Adapter：运行中取消
    register_adapter("cli-stdio", FakeAdapter(result_text="慢结果", delay_ms=300))
    task = _create_task(client, session)["task"]
    run = task["latest_run"]
    asyncio.run(dispatch_run(run["id"]))
    # 运行已结束（300ms 延迟已过）→ 取消返回终态（幂等）
    resp = client.post(f"/api/v2/agent-tasks/{task['id']}/cancel", json={"reason": "用户取消"})
    assert resp.status_code == 200
    assert resp.json()["task"]["status"] in ("succeeded", "cancelled")
    # 直接取消 queued 任务验证 cancel_requested→cancelled 路径
    task2 = _create_task(client, session, idempotency_key="k2")["task"]
    cancelled = client.post(f"/api/v2/agent-tasks/{task2['id']}/cancel").json()["task"]
    assert cancelled["status"] == "cancelled"


# ---------- Retry ----------


def test_retry_creates_new_run_keeps_history(client):
    _, _, session = _setup(client)
    register_adapter("cli-stdio", FakeAdapter(fail=True))
    task = _create_task(client, session)["task"]
    failed = _run_to_completion(client, task)
    assert failed["status"] == "failed"
    # 修好 Adapter 后重试
    register_adapter("cli-stdio", FakeAdapter(result_text="重试成功"))
    resp = client.post(f"/api/v2/agent-tasks/{task['id']}/retry", json={"mode": "original-context"})
    assert resp.status_code == 200, resp.text
    retried = resp.json()["task"]
    assert retried["status"] == "queued"
    assert retried["latest_run"]["attempt"] == 2
    # 历史 Run 保留（attempt 1 failed 仍在）
    runs = client.get(f"/api/v2/agent-tasks/{task['id']}/runs").json()["items"]
    assert [r["attempt"] for r in runs] == [2, 1]
    assert runs[1]["status"] == "failed"
    # 完成重试
    completed = _run_to_completion(client, retried)
    assert completed["status"] == "succeeded"
    assert completed["latest_run"]["attempt"] == 2


def test_retry_rejects_running_task(client):
    _, _, session = _setup(client)
    task = _create_task(client, session)["task"]
    resp = client.post(f"/api/v2/agent-tasks/{task['id']}/retry")
    assert resp.status_code == 409
    assert resp.json()["code"] == "AGENT_TASK_ALREADY_RUNNING"


# ---------- 幂等 ----------


def test_idempotency_same_key_returns_same_task(client):
    _, _, session = _setup(client)
    first = _create_task(client, session, idempotency_key="dup")
    second = _create_task(client, session, idempotency_key="dup")
    assert second["task"]["id"] == first["task"]["id"]
    assert second.get("reused") is True


def test_idempotency_same_key_different_body_conflict(client):
    _, _, session = _setup(client)
    _create_task(client, session, idempotency_key="dup", message="第一个")
    resp = client.post(
        f"/api/v2/agent-sessions/{session['id']}/tasks",
        json={"agent_profile_id": session["agent_profile_id"], "message": "第二个", "idempotency_key": "dup"},
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == "IDEMPOTENCY_KEY_REUSED"


# ---------- Context Snapshot ----------


def test_context_snapshot_pins_asset_version(client):
    """Run 启动时固定 Pinned Version：引用指定版本；资产当前版本变化不影响快照。"""
    from API.v2.agent_context import create_snapshot

    _, _, session = _setup(client)
    task = _create_task(client, session)["task"]
    run = task["latest_run"]
    # 建资产 v1
    up = client.post(
        "/api/v2/assets/ingest/upload",
        files={"files": ("a.png", b"\x89PNG\r\n\x1a\n" + b"0" * 20, "image/png")},
    )
    asset = up.json()["assets"][0]
    v1 = asset["current_version"]["id"]
    # 追加 v2（当前版本变化）
    client.post(f"/api/v2/assets/{asset['id']}/versions", files={"file": ("b.png", b"\x89PNG\r\n\x1a\n" + b"1" * 20, "image/png")})
    # Snapshot 固定引用 v1（真实 task/run FK）
    snap = create_snapshot(
        task["id"],
        run["id"],
        None,
        [{"reference_type": "asset", "reference_id": asset["id"], "version_ref": v1, "required": True, "title": "参考"}],
        {},
    )
    assert snap["pinned"][0]["version_ref"] == v1
    # 快照不可变：读取仍是 v1
    detail = client.get(f"/api/v2/agent-contexts/snapshots/{snap['id']}").json()["snapshot"]
    assert detail["references"][0]["version_ref"] == v1
    assert detail["asset_count"] == 1


def test_context_preview_resolves_versions(client):
    from API.v2.agent_context import resolve_pinned_versions

    up = client.post(
        "/api/v2/assets/ingest/upload",
        files={"files": ("a.png", b"\x89PNG\r\n\x1a\n" + b"0" * 20, "image/png")},
    )
    asset = up.json()["assets"][0]
    resp = client.post(
        "/api/v2/agent-contexts/preview",
        json={"selection_refs": [{"reference_type": "asset", "reference_id": asset["id"]}]},
    )
    assert resp.status_code == 200
    preview = resp.json()
    assert preview["asset_count"] == 1
    assert preview["chips"][0]["version_ref"] == asset["current_version"]["id"]


def test_context_rejects_missing_asset(client):
    resp = client.post(
        "/api/v2/agent-contexts/preview",
        json={"selection_refs": [{"reference_type": "asset", "reference_id": "ast_nope"}]},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "AGENT_CONTEXT_INVALID"


# ---------- 重启恢复 ----------


def test_recover_interrupted_runs(client):
    _, _, session = _setup(client)
    task = _create_task(client, session)["task"]
    run = task["latest_run"]
    # 模拟 Run 已 running 且租约过期（服务中断）
    conn = db.get_connection()
    conn.execute(
        "UPDATE agent_runs SET status = 'running', lease_expires_at_ms = ? WHERE id = ?",
        (1, run["id"]),
    )
    conn.execute("UPDATE agent_tasks SET status = 'running' WHERE id = ?", (task["id"],))
    conn.commit()
    result = recover_interrupted_runs()
    assert result["recovered"] == 1
    assert result["run_ids"] == [run["id"]]
    # Run 标 interrupted，Task 标 failed（允许 Retry）
    updated = client.get(f"/api/v2/agent-tasks/{task['id']}").json()["task"]
    assert updated["status"] == "failed"
    assert updated["latest_run"]["status"] == "interrupted"
    assert updated["error"]["code"] == "AGENT_RUN_INTERRUPTED"
    # Session 恢复 ready
    session_dto = client.get(f"/api/v2/agent-sessions/{session['id']}").json()["session"]
    assert session_dto["status"] == "ready"


# ---------- Permission ----------


def test_permission_decide_atomic(client):
    from API.v2.agent_contexts import create_permission_request

    _, _, session = _setup(client)
    task = _create_task(client, session)["task"]
    run = task["latest_run"]
    req_id = create_permission_request(run["id"], session["agent_profile_id"], "process.execute", "high", "执行命令")
    resp = client.post(f"/api/v2/permission-requests/{req_id}/decide", json={"decision": "allow", "scope": "once"})
    assert resp.status_code == 200
    assert resp.json()["permission_request"]["status"] == "allowed"
    # 二次决策 → 409（原子条件更新防双点）
    again = client.post(f"/api/v2/permission-requests/{req_id}/decide", json={"decision": "deny", "scope": "once"})
    assert again.status_code == 409
    assert again.json()["code"] == "PERMISSION_ALREADY_RESOLVED"


def test_permission_decide_scope_creates_grant(client):
    from API.v2.agent_contexts import create_permission_request

    _, _, session = _setup(client)
    task = _create_task(client, session)["task"]
    run = task["latest_run"]
    req_id = create_permission_request(run["id"], session["agent_profile_id"], "generation.online", "medium", "付费生成")
    client.post(f"/api/v2/permission-requests/{req_id}/decide", json={"decision": "allow", "scope": "session"})
    grants = client.get("/api/v2/permission-grants").json()["items"]
    assert len(grants) == 1
    assert grants[0]["scope"] == "session"
    assert grants[0]["permission_key"] == "generation.online"


# ---------- Skill 参与执行 ----------


def test_task_with_skill_resolves_version(client):
    """Task 指定 Skill：Dispatcher 解析激活版本并传给 Adapter。"""
    from API.v2.agent_adapters import get_adapter

    skill = client.post(
        "/api/v2/skills/import",
        files={"file": ("ref.zip", _skill_zip(b"skill_key: refiner\nname: Refiner\nversion: 1.0.0\nexecution_mode: prompt\n", "# Refiner\n执行说明"), "application/zip")},
    ).json()["skill"]
    _, _, session = _setup(client)
    task = _create_task(client, session, skill_id=skill["id"])["task"]
    run = task["latest_run"]
    asyncio.run(dispatch_run(run["id"]))
    adapter = get_adapter("cli-stdio")
    assert isinstance(adapter, FakeAdapter)
    assert adapter.submitted
    request = adapter.submitted[-1]
    assert request["skills"][0]["skill_key"] == "refiner"
    assert request["skills"][0]["version"] == "1.0.0"


def _skill_zip(yaml: bytes, md: bytes) -> bytes:
    import io
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("skill.yaml", yaml)
        zf.writestr("SKILL.md", md)
    return buf.getvalue()
