"""Studio V2 生成任务中心（F6 图片生成 + F8 ComfyUI 工作流 / Task Shelf 后端契约）。

独立轻量任务状态机（不复用旧 /api/canvas-image-tasks 的全局 Map）：
- 图片任务：提交时惰性复用旧接口的生成执行（main.build_online_image_result），避免循环导入；
- ComfyUI 任务（POST /comfy）：提交工作流字段值，复用旧 run_workflow（字段→节点覆盖映射 +
  generate 执行，同步函数跑线程池），供应商映射细节留在旧实现，前端只提交稳定 DTO；
- 状态机：queued → running → succeeded | failed | cancelled；
  即梦云端排队时为 jimeng_pending，查询时惰性触发自动续查
  （main.jimeng_query_result + jimeng_store_outputs），轮询契约最终到达终态；
- 取消优先：已取消任务不被后台协程改写（_update_task 守卫）；
- 时间统一 Epoch 毫秒（v2 约定）；错误统一 V2Error（problem+json）。

契约：docs/studio-v2-react-flow-node-model-and-registry-design.md §14
（Job Reference / MVP 轮询 Task Shelf，不要求完整 Event Hub）。
"""

import asyncio
import json
import os
import threading
import time
import uuid
from typing import Any, Dict, Set

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from API.v2.problems import ErrorCode, V2Error

router = APIRouter(prefix="/generation-tasks")

# 进程内任务存储（MVP 轻量轮询，不落库；服务重启后任务丢失属预期）
GENERATION_TASKS: Dict[str, Dict[str, Any]] = {}
TASKS_LOCK = threading.Lock()
# 正在自动续查的 jimeng 任务（防 GET 并发重复 spawn）
CONTINUING: Set[str] = set()
# 后台执行句柄（取消用；不进任务视图）
HANDLES: Dict[str, "asyncio.Task"] = {}

TERMINAL_STATUSES = {"succeeded", "failed", "cancelled"}
LIST_LIMIT_MAX = 100
LIST_LIMIT_DEFAULT = 20
# 进程内任务保留上限（MVP 轮询简化：超出丢弃最旧任务，防止无限增长）
TASKS_RETAIN_MAX = 100

# 提交后自动后台执行。测试关闭（AUTO_RUN=False）后手动驱动 run_generation_task：
# TestClient 的 portal 循环不保证调度后台任务，自动执行会引入竞态。
AUTO_RUN = True


def _now_ms() -> int:
    return int(time.time() * 1000)


def _update_task(task_id: str, **updates) -> bool:
    """安全回写任务字段：已取消的任务不再被后台协程改写（取消优先）。"""
    with TASKS_LOCK:
        task = GENERATION_TASKS.get(task_id)
        if not task or task.get("status") == "cancelled":
            return False
        task.update(updates)
        task["updated_at"] = _now_ms()
    return True


def _mark_running(task_id: str) -> None:
    with TASKS_LOCK:
        task = GENERATION_TASKS.get(task_id)
        if task and task.get("status") == "queued":
            task["status"] = "running"
            task["updated_at"] = _now_ms()


def _trim_overfull_store() -> None:
    """容量上限：超出保留最近 TASKS_RETAIN_MAX 条（按创建时间倒序裁剪最旧）。"""
    if len(GENERATION_TASKS) <= TASKS_RETAIN_MAX:
        return
    overflow = sorted(
        GENERATION_TASKS,
        key=lambda k: int(GENERATION_TASKS[k].get("created_at") or 0),
        reverse=True,
    )[TASKS_RETAIN_MAX:]
    for old_id in overflow:
        GENERATION_TASKS.pop(old_id, None)
        HANDLES.pop(old_id, None)
        CONTINUING.discard(old_id)


class GenerationSubmitRequest(BaseModel):
    """提交图片生成任务（字段与旧 OnlineImageRequest 对齐，由后端 Adapter 转换）。"""

    prompt: str
    provider_id: str = ""
    model: str = ""
    size: str = "1024x1024"
    quality: str = "auto"
    n: int = Field(default=1, ge=1, le=8)


async def run_generation_task(task_id: str, payload: GenerationSubmitRequest) -> None:
    """执行生成任务：复用旧接口 build_online_image_result，把结果回写状态机。
    惰性 import main（main 挂载本 router，模块级导入会循环依赖）。
    Adapter 边界：本模块 DTO → 旧 OnlineImageRequest（字段名对齐，供应商细节留在旧实现）。"""
    from main import JimengPendingError, OnlineImageRequest, build_online_image_result, jimeng_pending_payload

    _mark_running(task_id)
    try:
        legacy = OnlineImageRequest(
            prompt=payload.prompt,
            provider_id=payload.provider_id,
            model=payload.model,
            size=payload.size,
            quality=payload.quality,
            n=payload.n,
        )
        result = await build_online_image_result(legacy)
        _update_task(task_id, status="succeeded", result=result, error="", message="生成完成")
    except JimengPendingError as exc:
        # 即梦云端还在排队：置为 jimeng_pending，由 GET 惰性触发自动续查（任务未丢失）
        info = jimeng_pending_payload(exc)
        # 供应商私有字段（queue_info）不透传到 V2 视图，仅保留续查所需的 submit_id/kind 与展示 message
        _update_task(
            task_id,
            status="jimeng_pending",
            jimeng_pending=True,
            submit_id=exc.submit_id,
            kind=exc.kind,
            message=info.get("message", "即梦云端排队中"),
            error="",
        )
    except Exception as exc:
        detail = getattr(exc, "detail", None) or str(exc)
        status_code = getattr(exc, "status_code", 500)
        _update_task(task_id, status="failed", error=str(detail), status_code=status_code, message="生成失败")
    finally:
        with TASKS_LOCK:
            HANDLES.pop(task_id, None)


async def continue_jimeng_task(task_id: str) -> None:
    """即梦云端排队任务自动续查：循环续查直到成功/失败（轮询契约最终到达终态）。"""
    try:
        while True:
            with TASKS_LOCK:
                task = GENERATION_TASKS.get(task_id) or {}
                if task.get("status") != "jimeng_pending":
                    return
                submit_id = task.get("submit_id")
                kind = task.get("kind") or "image"
                prompt = task.get("prompt") or ""
                model = task.get("model") or ""
                provider_id = task.get("provider_id") or ""
            if not submit_id:
                _update_task(task_id, status="failed", error="即梦任务缺少 submit_id，无法续查", message="续查失败")
                return

            from main import (
                JimengPendingError,
                image_output_meta,
                jimeng_pending_payload,
                jimeng_query_result,
                jimeng_store_outputs,
            )

            try:
                queried = await jimeng_query_result(submit_id, kind)
                urls = await jimeng_store_outputs(queried, kind, allow_query=False)
            except JimengPendingError as exc:
                info = jimeng_pending_payload(exc)
                _update_task(
                    task_id,
                    status="jimeng_pending",
                    jimeng_pending=True,
                    message=info.get("message", "即梦云端排队中"),
                    error="",
                )
                await asyncio.sleep(5)
                continue
            except Exception as exc:
                detail = getattr(exc, "detail", None) or str(exc)
                _update_task(task_id, status="failed", error=str(detail), message="续查失败")
                return

            result = {
                "prompt": prompt,
                "images": urls,
                "image_items": [image_output_meta(u) for u in urls],
                "timestamp": time.time(),
                "type": "online",
                "model": model,
                "provider_id": provider_id,
                "provider_name": "即梦",
                "task_id": submit_id,
                "params": {},
            }
            _update_task(task_id, status="succeeded", result=result, error="", message="生成完成")
            return
    finally:
        with TASKS_LOCK:
            CONTINUING.discard(task_id)


@router.post("", status_code=202)
async def submit_generation_task(payload: GenerationSubmitRequest):
    """提交图片生成任务：立即返回 queued 任务，后台执行（旧接口异步包装）。"""
    prompt = str(payload.prompt or "").strip()
    if not prompt:
        raise V2Error(
            ErrorCode.VALIDATION_FAILED,
            422,
            "缺少提示词",
            detail="请填写生成提示词",
            field_errors={"prompt": "请输入提示词"},
        )
    task_id = f"gen_{uuid.uuid4().hex}"
    now = _now_ms()
    task = {
        "id": task_id,
        "type": "image",
        "status": "queued",
        "created_at": now,
        "updated_at": now,
        "result": None,
        "error": "",
        "message": "任务已提交",
        "prompt": prompt,
        "provider_id": str(payload.provider_id or "").strip(),
        "model": str(payload.model or "").strip(),
        "size": payload.size,
        "quality": payload.quality,
        "n": payload.n,
        "jimeng_pending": False,
        "submit_id": None,
        "kind": None,
        "status_code": None,
    }
    with TASKS_LOCK:
        GENERATION_TASKS[task_id] = task
        _trim_overfull_store()
    if AUTO_RUN:
        handle = asyncio.create_task(run_generation_task(task_id, payload))
        with TASKS_LOCK:
            HANDLES[task_id] = handle
    return {"task": dict(task)}


@router.get("")
async def list_generation_tasks(limit: int = LIST_LIMIT_DEFAULT, kind: str = ""):
    """近期生成任务（Task Shelf 轮询起点）：按创建时间倒序。"""
    limit = max(1, min(int(limit or LIST_LIMIT_DEFAULT), LIST_LIMIT_MAX))
    kind = str(kind or "").strip()
    with TASKS_LOCK:
        tasks = [dict(t) for t in GENERATION_TASKS.values()]
        total = len(tasks)
    if kind:
        tasks = [t for t in tasks if str(t.get("type") or "").strip() == kind]
    tasks.sort(key=lambda t: int(t.get("created_at") or 0), reverse=True)
    return {"tasks": tasks[:limit], "total": total}


@router.get("/{task_id}")
async def get_generation_task(task_id: str):
    """查询任务：jimeng_pending 时惰性触发自动续查（轮询契约：最终到达终态）。"""
    with TASKS_LOCK:
        task = GENERATION_TASKS.get(task_id)
        if not task:
            raise V2Error(
                ErrorCode.RESOURCE_NOT_FOUND,
                404,
                "生成任务不存在",
                detail="任务可能已过期或服务已重启",
            )
        spawn_continuation = task.get("status") == "jimeng_pending" and task_id not in CONTINUING
        if spawn_continuation:
            CONTINUING.add(task_id)
        view = dict(task)
    if spawn_continuation:
        asyncio.create_task(continue_jimeng_task(task_id))
    return {"task": view}


@router.post("/{task_id}/cancel")
async def cancel_generation_task(task_id: str):
    """取消排队/运行中的任务（幂等；已取消任务不再被后台改写）。"""
    with TASKS_LOCK:
        task = GENERATION_TASKS.get(task_id)
        if not task:
            raise V2Error(
                ErrorCode.RESOURCE_NOT_FOUND,
                404,
                "生成任务不存在",
                detail="任务可能已过期或服务已重启",
            )
        if task.get("status") in TERMINAL_STATUSES:
            return {"task": dict(task)}
        task["status"] = "cancelled"
        task["error"] = "任务已取消"
        task["message"] = "任务已取消"
        task["updated_at"] = _now_ms()
        view = dict(task)
    handle = HANDLES.pop(task_id, None)
    if handle is not None and not handle.done():
        handle.cancel()
    return {"task": view}


class ComfySubmitRequest(BaseModel):
    """提交 ComfyUI 工作流任务。

    field_values 按工作流 config 的字段 id 键控（如 f_prompt）；字段 → 节点输入覆盖的
    映射由后端完成（复用旧 run_workflow），前端/通用组件不感知 ComfyUI 内部结构。
    """

    workflow: str
    field_values: Dict[str, Any] = Field(default_factory=dict)


def normalize_comfy_result(result: Dict[str, Any], workflow: str) -> Dict[str, Any]:
    """把旧 generate() 的 ComfyUI 结果收敛为 v2 稳定引用视图（与图片任务 result 对齐）：
    images + image_items（url/kind/name）；运行细节（backend/prompt_id/seed 等）不进视图。"""
    images = [str(u) for u in (result.get("images") or []) if str(u or "").strip()]
    items = [it for it in (result.get("items") or []) if isinstance(it, dict) and it.get("url")]
    image_items = [
        {"url": str(it["url"]), "kind": str(it.get("kind") or "image"), "name": str(it.get("name") or "")}
        for it in items
    ]
    if not image_items:
        # 兜底：旧结果没有 items 时按 images 构造稳定引用（F12 消费 url + 元数据）
        image_items = [{"url": u, "kind": "image", "name": u.rsplit("/", 1)[-1]} for u in images]
    return {
        "images": images,
        "image_items": image_items,
        "workflow": workflow,
        "prompt": str(result.get("prompt") or ""),
        "timestamp": result.get("timestamp"),
        "task_id": str(result.get("task_id") or ""),
        "params": result.get("params") or {},
    }


async def run_comfy_task(task_id: str, payload: ComfySubmitRequest) -> None:
    """执行 ComfyUI 工作流任务：复用旧 run_workflow（字段→节点覆盖映射 + generate 执行）。
    run_workflow 为同步函数，跑在线程池（旧 /api/canvas-comfy-tasks 同款 to_thread 模式）。
    Adapter 边界：本模块 DTO → 旧 WorkflowRunRequest，供应商细节留在旧实现。"""
    from main import WorkflowConfig, WorkflowRunRequest, run_workflow, workflow_config_path

    _mark_running(task_id)
    workflow = str(payload.workflow or "").strip()
    try:
        cfg_path = workflow_config_path(workflow)
        if not os.path.exists(cfg_path):
            _update_task(
                task_id,
                status="failed",
                error="工作流缺少字段配置（.config.json），请先在 ComfyUI 设置中配置字段",
                message="工作流配置缺失",
            )
            return
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f) or {}
        # 字段默认值合并：未显式提交的字段按 config 默认值提交，保证表单显示值与执行值一致（所见即所得）
        values = dict(payload.field_values or {})
        for field in cfg.get("fields") or []:
            if (
                isinstance(field, dict)
                and field.get("id")
                and field["id"] not in values
                and field.get("default") is not None
            ):
                values[field["id"]] = field["default"]
        legacy = WorkflowRunRequest(
            fields=values,
            config=WorkflowConfig(**cfg),
            client_id="",
        )
        result = await asyncio.to_thread(run_workflow, workflow, legacy)
        if not isinstance(result, dict) or result.get("error"):
            raise RuntimeError(str(result.get("error") or "ComfyUI 工作流执行失败"))
        _update_task(
            task_id,
            status="succeeded",
            result=normalize_comfy_result(result, workflow),
            error="",
            message="生成完成",
        )
    except HTTPException as exc:
        # 工作流名非法/不存在（workflow_config_path / run_workflow 抛 4xx）
        _update_task(task_id, status="failed", error=str(exc.detail), status_code=exc.status_code, message="执行失败")
    except Exception as exc:
        detail = getattr(exc, "detail", None) or str(exc)
        status_code = getattr(exc, "status_code", 500)
        _update_task(task_id, status="failed", error=str(detail), status_code=status_code, message="执行失败")
    finally:
        with TASKS_LOCK:
            HANDLES.pop(task_id, None)


@router.post("/comfy", status_code=202)
async def submit_comfy_task(payload: ComfySubmitRequest):
    """提交 ComfyUI 工作流任务：立即返回 queued 任务，后台执行（旧接口异步包装）。"""
    workflow = str(payload.workflow or "").strip()
    if not workflow:
        raise V2Error(
            ErrorCode.VALIDATION_FAILED,
            422,
            "缺少工作流",
            detail="请选择要执行的工作流",
            field_errors={"workflow": "请选择工作流"},
        )
    task_id = f"comfy_{uuid.uuid4().hex}"
    now = _now_ms()
    task = {
        "id": task_id,
        "type": "comfy",
        "status": "queued",
        "created_at": now,
        "updated_at": now,
        "result": None,
        "error": "",
        "message": "任务已提交",
        "workflow": workflow,
        "field_values": dict(payload.field_values or {}),
        "status_code": None,
    }
    with TASKS_LOCK:
        GENERATION_TASKS[task_id] = task
        _trim_overfull_store()
    if AUTO_RUN:
        handle = asyncio.create_task(run_comfy_task(task_id, payload))
        with TASKS_LOCK:
            HANDLES[task_id] = handle
    return {"task": dict(task)}
