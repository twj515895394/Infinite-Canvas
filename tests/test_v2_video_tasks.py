"""视频生成任务（F7）测试。

覆盖 API/v2/generation_tasks.py 的视频部分：
- POST   /api/v2/generation-tasks/video          提交（202 + queued、type=video、id 前缀 video_）
- GET    /api/v2/generation-tasks/{id}           查询（与图片/comfy 共用同一状态机）
- GET    /api/v2/generation-tasks?kind=video     列表过滤
- POST   /api/v2/generation-tasks/{id}/cancel    取消（取消优先、幂等）

执行复用旧 canvas_video（async 原生）；测试一律 monkeypatch main.canvas_video；
状态机推进用 asyncio.run 手动驱动（TestClient 不推进后台任务）。
"""

import asyncio
import sys
import time
from pathlib import Path
from types import SimpleNamespace
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
    VideoSubmitRequest,
    normalize_video_result,
    router,
    run_video_task,
)
from API.v2.problems import V2Error, api_problem_exception_handler

app = FastAPI()
app.include_router(router, prefix="/api/v2")
app.add_exception_handler(V2Error, api_problem_exception_handler)


@pytest.fixture(autouse=True)
def clean_state():
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


LEGACY_VIDEO_RESULT = {
    "videos": ["/output/studio_v_abc.mp4"],
    "task_id": "vt_123",
    "raw": {"provider": "comfly", "submit_id": "sub-x", "poll": {"status": "done"}},
}

PAYLOAD = {"prompt": "一只飞行的龙", "provider_id": "comfly", "model": "veo3-fast", "duration": 5}


def submit(client, **overrides):
    body = {**PAYLOAD, **overrides}
    return client.post("/api/v2/generation-tasks/video", json=body)


def get_task(client, task_id):
    resp = client.get(f"/api/v2/generation-tasks/{task_id}")
    assert resp.status_code == 200, resp.text
    return resp.json()["task"]


# ---------- 提交 ----------

def test_submit_returns_queued_video_task(client):
    """提交返回 202 + queued，type=video、id 前缀 video_，参数入视图（时间 Epoch 毫秒）。"""
    resp = submit(client)
    assert resp.status_code == 202
    task = resp.json()["task"]
    assert task["status"] == "queued"
    assert task["id"].startswith("video_")
    assert task["type"] == "video"
    assert task["prompt"] == "一只飞行的龙"
    assert task["duration"] == 5
    assert task["aspect_ratio"] == "16:9"
    assert task["created_at"] > 1_000_000_000_000

    listing = client.get("/api/v2/generation-tasks?kind=video").json()
    assert [t["id"] for t in listing["tasks"]] == [task["id"]]
    assert listing["total"] == 1


def test_submit_requires_prompt(client):
    """空提示词返回 422 VALIDATION_FAILED（统一 problem+json）。"""
    resp = submit(client, prompt="   ")
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "VALIDATION_FAILED"
    assert "prompt" in (body.get("field_errors") or {})


def test_submit_validates_duration_range(client):
    """duration 越界返回 422（字段级校验由 pydantic 完成）。"""
    resp = submit(client, duration=0)
    assert resp.status_code == 422


# ---------- 执行 ----------

def test_run_to_succeeded_with_normalized_result(client):
    """状态机推进到 succeeded；结果收敛为 v2 稳定引用（videos + video_items），
    raw 供应商私有字段不进视图。"""
    async def fake_canvas_video(_payload):
        await asyncio.sleep(0.05)
        return LEGACY_VIDEO_RESULT

    task_id = submit(client).json()["task"]["id"]
    with patch.object(main, "canvas_video", new=fake_canvas_video):
        asyncio.run(run_video_task(task_id, VideoSubmitRequest(**PAYLOAD)))

    task = get_task(client, task_id)
    assert task["status"] == "succeeded"
    assert task["result"]["videos"] == ["/output/studio_v_abc.mp4"]
    assert task["result"]["video_items"] == [
        {"url": "/output/studio_v_abc.mp4", "kind": "video", "name": "studio_v_abc.mp4"}
    ]
    assert "raw" not in task["result"]
    assert task["result"]["params"]["duration"] == 5


def test_legacy_http_error_fails_task(client):
    """上游 HTTPException（未配置 Key/Base URL/上游错误）：failed 且 status_code 透传。"""
    async def fake_canvas_video(_payload):
        raise HTTPException(status_code=400, detail="未配置 comfly 的 API Key，请在 API 设置中填写。")

    task_id = submit(client).json()["task"]["id"]
    with patch.object(main, "canvas_video", new=fake_canvas_video):
        asyncio.run(run_video_task(task_id, VideoSubmitRequest(**PAYLOAD)))

    task = get_task(client, task_id)
    assert task["status"] == "failed"
    assert "API Key" in task["error"]
    assert task["status_code"] == 400


def test_empty_videos_result_fails_task(client):
    """上游返回空 videos：视为失败（不产生空成功）。"""
    async def fake_canvas_video(_payload):
        return {"videos": [], "task_id": "vt_x", "raw": {}}

    task_id = submit(client).json()["task"]["id"]
    with patch.object(main, "canvas_video", new=fake_canvas_video):
        asyncio.run(run_video_task(task_id, VideoSubmitRequest(**PAYLOAD)))

    task = get_task(client, task_id)
    assert task["status"] == "failed"
    assert "未返回结果" in task["error"]


def test_run_video_never_overwrites_cancelled(client):
    """取消优先：已取消的 video 任务不被后台协程改写。"""
    async def fake_canvas_video(_payload):
        await asyncio.sleep(0.2)
        return LEGACY_VIDEO_RESULT

    task_id = submit(client).json()["task"]["id"]
    cancel = client.post(f"/api/v2/generation-tasks/{task_id}/cancel")
    assert cancel.json()["task"]["status"] == "cancelled"
    with patch.object(main, "canvas_video", new=fake_canvas_video):
        asyncio.run(run_video_task(task_id, VideoSubmitRequest(**PAYLOAD)))

    task = get_task(client, task_id)
    assert task["status"] == "cancelled"


def test_kind_filter_separates_video_and_image(client):
    """kind 过滤：video 与 image 任务同库但可按 type 区分。"""
    video_id = submit(client).json()["task"]["id"]
    img_resp = client.post(
        "/api/v2/generation-tasks", json={"prompt": "a cat", "provider_id": "comfly", "model": "gpt-image-1"}
    )
    img_id = img_resp.json()["task"]["id"]

    listing = client.get("/api/v2/generation-tasks").json()
    assert listing["total"] == 2
    video_only = client.get("/api/v2/generation-tasks?kind=video").json()["tasks"]
    assert [t["id"] for t in video_only] == [video_id]
    image_only = client.get("/api/v2/generation-tasks?kind=image").json()["tasks"]
    assert [t["id"] for t in image_only] == [img_id]


# ---------- 结果归一化（纯函数） ----------

REQ = SimpleNamespace(prompt=PAYLOAD["prompt"], provider_id=PAYLOAD["provider_id"], model=PAYLOAD["model"], duration=PAYLOAD["duration"], aspect_ratio="16:9", resolution="")


def test_normalize_video_result_drops_raw():
    out = normalize_video_result(LEGACY_VIDEO_RESULT, REQ)
    assert out["videos"] == ["/output/studio_v_abc.mp4"]
    assert out["video_items"][0]["kind"] == "video"
    assert out["task_id"] == "vt_123"
    assert "raw" not in out
    assert "submit_id" not in out


def test_normalize_video_result_empty_videos():
    out = normalize_video_result({"videos": [], "task_id": "vt_x"}, REQ)
    assert out["videos"] == []
    assert out["video_items"] == []
