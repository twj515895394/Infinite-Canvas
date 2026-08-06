"""Generation Task（F6 图片生成闭环 / Task Shelf）测试。

覆盖 API/v2/generation_tasks.py：
- POST   /api/v2/generation-tasks                  提交（202 + queued）
- GET    /api/v2/generation-tasks                  近期任务列表（倒序/过滤/limit）
- GET    /api/v2/generation-tasks/{id}             查询（jimeng_pending 惰性续查）
- POST   /api/v2/generation-tasks/{id}/cancel      取消（幂等、取消优先）

生成函数（main.build_online_image_result / jimeng_query_result / jimeng_store_outputs）
一律 monkeypatch；状态机推进用 asyncio.run 直接驱动（TestClient 不推进后台任务）。
"""

import asyncio
import sys
import time
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main
from API.v2 import generation_tasks as gen
from API.v2.generation_tasks import (
    CONTINUING,
    GENERATION_TASKS,
    HANDLES,
    GenerationSubmitRequest,
    continue_jimeng_task,
    router,
    run_generation_task,
)
from API.v2.problems import V2Error, api_problem_exception_handler

app = FastAPI()
app.include_router(router, prefix="/api/v2")
app.add_exception_handler(V2Error, api_problem_exception_handler)


@pytest.fixture(autouse=True)
def clean_state():
    # 关闭提交后自动执行：状态机推进由测试手动 asyncio.run 驱动（TestClient 不调度后台任务）
    gen.AUTO_RUN = False
    GENERATION_TASKS.clear()
    CONTINUING.clear()
    HANDLES.clear()
    yield
    gen.AUTO_RUN = True
    GENERATION_TASKS.clear()
    CONTINUING.clear()
    HANDLES.clear()


@pytest.fixture()
def client():
    return TestClient(app)


FAKE_RESULT = {
    "prompt": "a red apple",
    "images": ["/output/fake_1.png"],
    "image_items": [{"url": "/output/fake_1.png", "kind": "image", "name": "fake_1.png"}],
    "timestamp": time.time(),
    "type": "online",
    "model": "gpt-image-1",
    "provider_id": "comfly",
    "provider_name": "Comfy",
}

PAYLOAD = {"prompt": "a red apple", "provider_id": "comfly", "model": "gpt-image-1"}


def submit(client, **overrides):
    body = {**PAYLOAD, **overrides}
    return client.post("/api/v2/generation-tasks", json=body)


def get_task(client, task_id):
    resp = client.get(f"/api/v2/generation-tasks/{task_id}")
    assert resp.status_code == 200, resp.text
    return resp.json()["task"]


# ---------- 提交与列表 ----------

def test_submit_returns_queued_task(client):
    """提交返回 202 + queued 任务，且立即出现在列表中（时间 Epoch 毫秒）。"""
    resp = submit(client)
    assert resp.status_code == 202
    task = resp.json()["task"]
    assert task["status"] == "queued"
    assert task["id"].startswith("gen_")
    assert task["type"] == "image"
    assert task["prompt"] == "a red apple"
    assert task["created_at"] > 1_000_000_000_000  # Epoch 毫秒

    listing = client.get("/api/v2/generation-tasks").json()
    assert [t["id"] for t in listing["tasks"]] == [task["id"]]


def test_submit_requires_prompt(client):
    """空提示词返回 422 VALIDATION_FAILED（统一 problem+json）。"""
    resp = submit(client, prompt="   ")
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "VALIDATION_FAILED"
    assert "prompt" in (body.get("field_errors") or {})


def test_run_to_succeeded(client):
    """状态机推进：queued → running → succeeded，结果含稳定引用（url + image_items）。"""
    async def fake_build(_payload):
        await asyncio.sleep(0.1)
        return FAKE_RESULT

    task_id = submit(client).json()["task"]["id"]
    with patch.object(main, "build_online_image_result", new=fake_build):
        asyncio.run(run_generation_task(task_id, GenerationSubmitRequest(**PAYLOAD)))

    task = get_task(client, task_id)
    assert task["status"] == "succeeded"
    assert task["result"]["images"] == ["/output/fake_1.png"]
    assert task["result"]["image_items"][0]["url"] == "/output/fake_1.png"


def test_failure_sets_error_and_status_code(client):
    """上游失败：failed，error 可理解，status_code 透传（前端展示/重试依据）。"""
    async def fake_build(_payload):
        raise HTTPException(status_code=502, detail="上游服务返回 500：模型超载")

    task_id = submit(client).json()["task"]["id"]
    with patch.object(main, "build_online_image_result", new=fake_build):
        asyncio.run(run_generation_task(task_id, GenerationSubmitRequest(**PAYLOAD)))

    task = get_task(client, task_id)
    assert task["status"] == "failed"
    assert "超载" in task["error"]
    assert task["status_code"] == 502


# ---------- 取消 ----------

def test_cancel_queued_task(client):
    """排队中取消：cancelled，且后台协程不再改写（取消优先）。"""
    async def fake_build(_payload):
        await asyncio.sleep(0.3)
        return FAKE_RESULT

    task_id = submit(client).json()["task"]["id"]
    with patch.object(main, "build_online_image_result", new=fake_build):
        cancel = client.post(f"/api/v2/generation-tasks/{task_id}/cancel")
        assert cancel.status_code == 200
        assert cancel.json()["task"]["status"] == "cancelled"
        # 后台协程（若推进）不得把 cancelled 覆盖为 succeeded
        asyncio.run(run_generation_task(task_id, GenerationSubmitRequest(**PAYLOAD)))

    task = get_task(client, task_id)
    assert task["status"] == "cancelled"


def test_cancel_terminal_task_is_noop(client):
    """终态任务取消为幂等空操作：不改变 succeeded。"""
    async def fake_build(_payload):
        return FAKE_RESULT

    task_id = submit(client).json()["task"]["id"]
    with patch.object(main, "build_online_image_result", new=fake_build):
        asyncio.run(run_generation_task(task_id, GenerationSubmitRequest(**PAYLOAD)))
    cancel = client.post(f"/api/v2/generation-tasks/{task_id}/cancel")
    assert cancel.status_code == 200
    assert cancel.json()["task"]["status"] == "succeeded"


def test_cancel_missing_task_404(client):
    resp = client.post("/api/v2/generation-tasks/nope/cancel")
    assert resp.status_code == 404
    assert resp.json()["code"] == "RESOURCE_NOT_FOUND"


# ---------- 列表 ----------

def test_list_order_kind_filter_and_limit(client):
    """列表按创建倒序；kind 过滤；limit 截断。"""
    async def fake_build(_payload):
        return FAKE_RESULT

    with patch.object(main, "build_online_image_result", new=fake_build):
        first = submit(client, prompt="first").json()["task"]["id"]
        second = submit(client, prompt="second").json()["task"]["id"]

    listing = client.get("/api/v2/generation-tasks").json()
    assert [t["id"] for t in listing["tasks"]] == [second, first]
    assert listing["total"] == 2

    limited = client.get("/api/v2/generation-tasks?limit=1").json()["tasks"]
    assert [t["id"] for t in limited] == [second]

    no_comfy = client.get("/api/v2/generation-tasks?kind=comfy").json()["tasks"]
    assert no_comfy == []


# ---------- 即梦自动续查 ----------

def test_jimeng_pending_auto_continuation_succeeds(client):
    """即梦排队 → jimeng_pending；GET 惰性触发续查 → 成功结果写回（轮询契约不变）。"""
    async def fake_build(_payload):
        raise main.JimengPendingError("sub_123", kind="image", queue_info={"queue_length": 5})

    async def fake_query_result(_submit_id, _kind):
        return {"_stdout": "succeeded"}

    async def fake_store_outputs(_raw, _kind, allow_query=True):
        return ["/output/jimeng_1.png"]

    task_id = submit(client, provider_id="jimeng", model="5.0").json()["task"]["id"]
    with (
        patch.object(main, "build_online_image_result", new=fake_build),
        patch.object(main, "jimeng_query_result", new=fake_query_result),
        patch.object(main, "jimeng_store_outputs", new=fake_store_outputs),
    ):
        asyncio.run(run_generation_task(task_id, GenerationSubmitRequest(**PAYLOAD)))
        pending = get_task(client, task_id)
        assert pending["status"] == "jimeng_pending"
        assert pending["submit_id"] == "sub_123"
        assert pending["jimeng_pending"] is True

        # GET 触发续查（TestClient 不推进后台任务，这里手动驱动同一协程）
        client.get(f"/api/v2/generation-tasks/{task_id}")
        asyncio.run(continue_jimeng_task(task_id))

    task = get_task(client, task_id)
    assert task["status"] == "succeeded"
    assert task["result"]["images"] == ["/output/jimeng_1.png"]
    assert task["result"]["provider_name"] == "即梦"


def test_jimeng_pending_auto_continuation_fails(client):
    """即梦续查失败：任务到达 failed 且 error 可理解。"""
    async def fake_build(_payload):
        raise main.JimengPendingError("sub_456", kind="image", queue_info=None)

    async def fake_query_result(_submit_id, _kind):
        raise HTTPException(status_code=502, detail="即梦任务失败：余额不足")

    task_id = submit(client, provider_id="jimeng").json()["task"]["id"]
    with (
        patch.object(main, "build_online_image_result", new=fake_build),
        patch.object(main, "jimeng_query_result", new=fake_query_result),
    ):
        asyncio.run(run_generation_task(task_id, GenerationSubmitRequest(**PAYLOAD)))
        client.get(f"/api/v2/generation-tasks/{task_id}")
        asyncio.run(continue_jimeng_task(task_id))

    task = get_task(client, task_id)
    assert task["status"] == "failed"
    assert "余额不足" in task["error"]


# ---------- 404 ----------

def test_get_missing_task_404(client):
    resp = client.get("/api/v2/generation-tasks/nope")
    assert resp.status_code == 404
    assert resp.json()["code"] == "RESOURCE_NOT_FOUND"
