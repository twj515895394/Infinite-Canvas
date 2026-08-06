"""ComfyUI 工作流任务（F8）测试。

覆盖 API/v2/generation_tasks.py 的 ComfyUI 部分：
- POST   /api/v2/generation-tasks/comfy          提交（202 + queued、type=comfy、workflow 存储）
- GET    /api/v2/generation-tasks/{id}           查询（与图片任务共用同一状态机）
- GET    /api/v2/generation-tasks?kind=comfy     列表过滤
- POST   /api/v2/generation-tasks/{id}/cancel    取消（取消优先、幂等）

执行复用旧 run_workflow（字段→节点覆盖映射 + generate）；测试一律 monkeypatch
main.run_workflow / main.workflow_config_path；状态机推进用 asyncio.run 手动驱动。
"""

import asyncio
import json
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
    ComfySubmitRequest,
    normalize_comfy_result,
    router,
    run_comfy_task,
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


# 与旧 run_workflow 返回值同构的假结果（legacy generate() 输出形态）
LEGACY_RESULT = {
    "prompt": "a flying car",
    "images": ["/output/studio_abc123.png"],
    "videos": [],
    "audios": [],
    "texts": [],
    "files": [],
    "items": [
        {
            "url": "/output/studio_abc123.png",
            "kind": "image",
            "name": "studio_abc123.png",
            "node_id": "9",
            "output_key": "images",
            "class_type": "SaveImage",
        }
    ],
    "outputs": ["/output/studio_abc123.png"],
    "seed": 12345,
    "timestamp": time.time(),
    "type": "workflow-test",
    "workflow_json": "MiniMax_H3.json",
    "task_id": 7,
    "prompt_id": "mock-prompt-id",
    "backend": "127.0.0.1:8188",
    "params": {"115": {"aspect_ratio": "16:9 (Widescreen)"}},
}

# 测试用工作流字段配置（等价于 workflows/*.config.json 的磁盘形态）
FIELD_CFG = {
    "title": "测试工作流",
    "fields": [
        {
            "id": "f_prompt",
            "node": "46",
            "input": "value",
            "name": "提示词",
            "type": "textarea",
            "default": "",
            "min": None,
            "max": None,
            "step": None,
            "options": [],
            "bind_prompt": True,
        },
        {
            "id": "f_duration",
            "node": "132",
            "input": "value",
            "name": "时长",
            "type": "number",
            "default": 8,
            "min": 0.5,
            "max": 60,
            "step": 0.1,
            "options": [],
        },
        {
            "id": "f_ratio",
            "node": "115",
            "input": "aspect_ratio",
            "name": "比例",
            "type": "dropdown",
            "default": "16:9 (Widescreen)",
            "min": None,
            "max": None,
            "step": None,
            "options": ["16:9 (Widescreen)", "1:1 (Square)"],
        },
    ],
}


def _patch_config(tmp_path, monkeypatch):
    """让 workflow_config_path 指向测试配置，并把 run_workflow 替换为捕获调用的假实现。"""
    cfg_file = tmp_path / "mock.config.json"
    cfg_file.write_text(json.dumps(FIELD_CFG), encoding="utf-8")
    captured = {}

    def fake_config_path(_name):
        return str(cfg_file)

    def fake_run_workflow(name, legacy):
        captured["name"] = name
        captured["legacy"] = legacy
        return LEGACY_RESULT

    monkeypatch.setattr(main, "workflow_config_path", fake_config_path)
    monkeypatch.setattr(main, "run_workflow", fake_run_workflow)
    return captured


def submit(client, **overrides):
    body = {"workflow": "custom/test.json", "field_values": {"f_prompt": "hello"}}
    body.update(overrides)
    return client.post("/api/v2/generation-tasks/comfy", json=body)


def get_task(client, task_id):
    resp = client.get(f"/api/v2/generation-tasks/{task_id}")
    assert resp.status_code == 200, resp.text
    return resp.json()["task"]


# ---------- 提交 ----------

def test_submit_returns_queued_comfy_task(client):
    """提交返回 202 + queued，type=comfy、id 前缀 comfy_、workflow 与字段值入视图。"""
    resp = submit(client)
    assert resp.status_code == 202
    task = resp.json()["task"]
    assert task["status"] == "queued"
    assert task["id"].startswith("comfy_")
    assert task["type"] == "comfy"
    assert task["workflow"] == "custom/test.json"
    assert task["field_values"] == {"f_prompt": "hello"}
    assert task["created_at"] > 1_000_000_000_000  # Epoch 毫秒

    listing = client.get("/api/v2/generation-tasks?kind=comfy").json()
    assert [t["id"] for t in listing["tasks"]] == [task["id"]]
    assert listing["total"] == 1


def test_submit_requires_workflow(client):
    """空工作流返回 422 VALIDATION_FAILED（统一 problem+json）。"""
    resp = submit(client, workflow="   ")
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "VALIDATION_FAILED"
    assert "workflow" in (body.get("field_errors") or {})


def test_submit_allows_empty_field_values(client):
    """field_values 可缺省（全部用字段默认值）。"""
    resp = submit(client, field_values={})
    assert resp.status_code == 202
    assert resp.json()["task"]["field_values"] == {}


# ---------- 执行 ----------

def test_run_to_succeeded_with_normalized_result(client, tmp_path, monkeypatch):
    """状态机推进到 succeeded；结果收敛为 v2 稳定引用（images + image_items），
    不含运行细节（backend/prompt_id/seed 等 legacy 字段）。"""
    captured = _patch_config(tmp_path, monkeypatch)
    task_id = submit(client).json()["task"]["id"]

    asyncio.run(run_comfy_task(task_id, ComfySubmitRequest(**{"workflow": "custom/test.json", "field_values": {"f_prompt": "hello"}})))

    task = get_task(client, task_id)
    assert task["status"] == "succeeded"
    assert task["result"]["images"] == ["/output/studio_abc123.png"]
    assert task["result"]["image_items"] == [
        {"url": "/output/studio_abc123.png", "kind": "image", "name": "studio_abc123.png"}
    ]
    assert task["result"]["workflow"] == "custom/test.json"
    # 运行细节不进视图
    assert "backend" not in task["result"]
    assert "prompt_id" not in task["result"]
    assert "seed" not in task["result"]

    # 字段值按字段 id 透传，config 从磁盘加载（字段→节点映射留给旧 run_workflow）；
    # 未显式提交的字段按 config 默认值合并（表单显示值与执行值一致）
    assert captured["name"] == "custom/test.json"
    assert captured["legacy"].fields == {
        "f_prompt": "hello",
        "f_duration": 8,
        "f_ratio": "16:9 (Widescreen)",
    }
    assert captured["legacy"].config.fields[0].id == "f_prompt"
    assert captured["legacy"].config.fields[2].options == ["16:9 (Widescreen)", "1:1 (Square)"]


def test_field_defaults_merged_for_unsubmitted(client, tmp_path, monkeypatch):
    """只提交部分字段时，其余字段按 config 默认值合并（所见即所得）。"""
    captured = _patch_config(tmp_path, monkeypatch)
    task_id = submit(client, field_values={"f_duration": 12}).json()["task"]["id"]

    asyncio.run(
        run_comfy_task(task_id, ComfySubmitRequest(**{"workflow": "custom/test.json", "field_values": {"f_duration": 12}}))
    )

    assert captured["legacy"].fields == {
        "f_duration": 12,  # 用户显式值优先
        "f_prompt": "",  # 默认空串也被合并（与表单显示一致）
        "f_ratio": "16:9 (Widescreen)",
    }


def test_legacy_error_dict_fails_task(client, tmp_path, monkeypatch):
    """旧 generate 以 {images: [], error} 返回失败：任务 failed 且 error 可理解。"""
    _patch_config(tmp_path, monkeypatch)
    monkeypatch.setattr(
        main,
        "run_workflow",
        lambda _name, _legacy: {"images": [], "error": "ComfyUI 渲染超时"},
    )
    task_id = submit(client).json()["task"]["id"]
    asyncio.run(run_comfy_task(task_id, ComfySubmitRequest(**{"workflow": "custom/test.json"})))

    task = get_task(client, task_id)
    assert task["status"] == "failed"
    assert "渲染超时" in task["error"]


def test_missing_workflow_404_fails_task(client, tmp_path, monkeypatch):
    """工作流不存在（run_workflow 抛 HTTPException 404）：failed 且 status_code 透传。"""
    _patch_config(tmp_path, monkeypatch)

    def raise_404(_name, _legacy):
        raise HTTPException(status_code=404, detail="Workflow not found")

    monkeypatch.setattr(main, "run_workflow", raise_404)
    task_id = submit(client).json()["task"]["id"]
    asyncio.run(run_comfy_task(task_id, ComfySubmitRequest(**{"workflow": "custom/nope.json"})))

    task = get_task(client, task_id)
    assert task["status"] == "failed"
    assert task["status_code"] == 404
    assert "not found" in task["error"]


def test_missing_config_fails_with_guidance(client, tmp_path, monkeypatch):
    """工作流存在但无 .config.json：failed 并提示先配置字段。"""
    monkeypatch.setattr(main, "workflow_config_path", lambda _name: str(tmp_path / "no-config.json"))
    task_id = submit(client).json()["task"]["id"]
    asyncio.run(run_comfy_task(task_id, ComfySubmitRequest(**{"workflow": "custom/test.json"})))

    task = get_task(client, task_id)
    assert task["status"] == "failed"
    assert ".config.json" in task["error"]


def test_run_comfy_task_never_overwrites_cancelled(client, tmp_path, monkeypatch):
    """取消优先：已取消的 comfy 任务不被后台协程改写为 succeeded。"""
    captured = _patch_config(tmp_path, monkeypatch)
    task_id = submit(client).json()["task"]["id"]

    cancel = client.post(f"/api/v2/generation-tasks/{task_id}/cancel")
    assert cancel.json()["task"]["status"] == "cancelled"
    asyncio.run(run_comfy_task(task_id, ComfySubmitRequest(**{"workflow": "custom/test.json"})))

    task = get_task(client, task_id)
    assert task["status"] == "cancelled"
    assert captured.get("legacy") is not None  # 执行确实发生，但写回被守卫拦截


# ---------- 列表与取消 ----------

def test_kind_filter_separates_image_and_comfy(client, tmp_path, monkeypatch):
    """kind 过滤：comfy 任务与图片任务同库但可按 type 区分。"""
    _patch_config(tmp_path, monkeypatch)
    comfy_id = submit(client).json()["task"]["id"]
    img_resp = client.post(
        "/api/v2/generation-tasks", json={"prompt": "a cat", "provider_id": "comfly", "model": "gpt-image-1"}
    )
    img_id = img_resp.json()["task"]["id"]

    listing = client.get("/api/v2/generation-tasks").json()
    assert listing["total"] == 2
    comfy_only = client.get("/api/v2/generation-tasks?kind=comfy").json()["tasks"]
    assert [t["id"] for t in comfy_only] == [comfy_id]
    image_only = client.get("/api/v2/generation-tasks?kind=image").json()["tasks"]
    assert [t["id"] for t in image_only] == [img_id]


def test_cancel_terminal_comfy_task_is_noop(client, tmp_path, monkeypatch):
    """终态 comfy 任务取消为幂等空操作。"""
    _patch_config(tmp_path, monkeypatch)
    task_id = submit(client).json()["task"]["id"]
    asyncio.run(run_comfy_task(task_id, ComfySubmitRequest(**{"workflow": "custom/test.json"})))

    resp = client.post(f"/api/v2/generation-tasks/{task_id}/cancel")
    assert resp.json()["task"]["status"] == "succeeded"


# ---------- 结果归一化（纯函数） ----------

def test_normalize_comfy_result_drops_legacy_noise():
    out = normalize_comfy_result(LEGACY_RESULT, "MiniMax_H3.json")
    assert out["images"] == ["/output/studio_abc123.png"]
    assert out["image_items"][0] == {"url": "/output/studio_abc123.png", "kind": "image", "name": "studio_abc123.png"}
    assert out["workflow"] == "MiniMax_H3.json"
    assert out["params"] == {"115": {"aspect_ratio": "16:9 (Widescreen)"}}
    assert "backend" not in out
    assert "prompt_id" not in out


def test_normalize_comfy_result_falls_back_to_images():
    """旧结果无 items 时按 images 构造稳定引用（零输出兜底）。"""
    out = normalize_comfy_result({"images": ["/output/a.png", "/output/b.png"], "items": []}, "custom/x.json")
    assert out["image_items"] == [
        {"url": "/output/a.png", "kind": "image", "name": "a.png"},
        {"url": "/output/b.png", "kind": "image", "name": "b.png"},
    ]


def test_normalize_comfy_result_filters_bad_items():
    """空 url 条目被滤除；kind 异常条目回退为 image（稳定引用保持可消费）。"""
    out = normalize_comfy_result(
        {
            "images": ["/output/a.png"],
            "items": [
                {"url": "", "kind": "image", "name": "empty.png"},
                {"url": "/output/a.png", "kind": None, "name": "a.png"},
                {"url": "/output/v.mp4", "kind": "video", "name": "v.mp4"},
            ],
        },
        "custom/x.json",
    )
    assert out["image_items"] == [
        {"url": "/output/a.png", "kind": "image", "name": "a.png"},
        {"url": "/output/v.mp4", "kind": "video", "name": "v.mp4"},
    ]
