"""Project V2：CRUD + 归档 + revision 乐观锁。

契约：复用 data/projects.json（与旧前端共享，保持旧字段兼容），V2 附加
revision / archived / archived_at 字段；PATCH 区分"未提供"与"置 null"。
"""

import json
import os
import threading
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from API.v2 import db
from API.v2.pagination import build_page, page_params
from API.v2.problems import ErrorCode, V2Error

DEFAULT_PROJECT_ID = "default"

router = APIRouter()

_PROJECTS_PATH: Optional[str] = None
_PROJECTS_LOCK = threading.Lock()

# PATCH 允许更新的字段（白名单，防止意外写坏旧字段）
_PATCHABLE = ("name", "order")


def set_projects_path(path: str) -> None:
    """测试注入：覆盖 projects.json 路径。"""
    global _PROJECTS_PATH
    _PROJECTS_PATH = path


def projects_path() -> str:
    if _PROJECTS_PATH:
        return _PROJECTS_PATH
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(root, "data", "projects.json")


def _load() -> List[Dict[str, Any]]:
    path = projects_path()
    if not os.path.isfile(path):
        return []
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (json.JSONDecodeError, OSError):
        return []
    return list(data.get("projects") or [])


def _save(projects: List[Dict[str, Any]]) -> None:
    path = projects_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump({"projects": projects}, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _record(p: Dict[str, Any]) -> Dict[str, Any]:
    """输出 DTO：旧字段 + V2 扩展字段（缺省补全）。"""
    return {
        "id": p["id"],
        "name": p.get("name", ""),
        "order": p.get("order", 0),
        "created_at": p.get("created_at"),
        "updated_at": p.get("updated_at"),
        "revision": p.get("revision", 1),
        "archived": bool(p.get("archived")),
        "archived_at": p.get("archived_at"),
    }


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ProjectPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    order: Optional[int] = None
    base_revision: Optional[int] = None


@router.get("/projects")
def list_projects_v2(limit: int | None = None, cursor: str | None = None) -> Dict:
    """项目列表（分页，隐藏归档项目，按 updated_at 倒序）。"""
    limit, offset = page_params(limit, cursor)
    with _PROJECTS_LOCK:
        projects = _load()
    active = [p for p in projects if not p.get("archived")]
    active.sort(key=lambda p: p.get("updated_at") or 0, reverse=True)
    items = [_record(p) for p in active[offset : offset + limit]]
    return build_page(items=items, total=len(active), limit=limit, cursor=cursor)


@router.post("/projects")
def create_project_v2(payload: ProjectCreate) -> Dict:
    project = {
        "id": db.new_id("prj"),
        "name": payload.name.strip(),
        "order": 0,
        "created_at": _now_ms(),
        "updated_at": _now_ms(),
        "revision": 1,
        "archived": False,
    }
    with _PROJECTS_LOCK:
        projects = _load()
        projects.append(project)
        _save(projects)
    return {"project": _record(project)}


def _find(project_id: str) -> Optional[Dict[str, Any]]:
    with _PROJECTS_LOCK:
        projects = _load()
        return next((p for p in projects if p.get("id") == project_id), None)


@router.get("/projects/{project_id}")
def get_project_v2(project_id: str) -> Dict:
    project = _find(project_id)
    if project is None:
        raise V2Error(
            code=ErrorCode.PROJECT_NOT_FOUND,
            status=404,
            title="Project not found",
            detail=f"项目 {project_id} 不存在",
        )
    return {"project": _record(project)}


@router.patch("/projects/{project_id}")
def patch_project_v2(project_id: str, payload: ProjectPatch) -> Dict:
    # 手动校验 base_revision（不依赖全局 RequestValidationError handler，避免影响旧接口）
    if payload.base_revision is None:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=422,
            title="Missing base_revision",
            detail="PATCH 必须携带 base_revision 做乐观锁",
            field_errors={"base_revision": "required"},
        )
    with _PROJECTS_LOCK:
        projects = _load()
        project = next((p for p in projects if p.get("id") == project_id), None)
        if project is None:
            raise V2Error(
                code=ErrorCode.PROJECT_NOT_FOUND,
                status=404,
                title="Project not found",
                detail=f"项目 {project_id} 不存在",
            )
        current = project.get("revision", 1)
        if payload.base_revision != current:
            raise V2Error(
                code=ErrorCode.PROJECT_REVISION_CONFLICT,
                status=409,
                title="Revision conflict",
                detail=f"项目已被修改，当前 revision={current}",
                context={"current_revision": current},
            )
        updates = payload.model_dump(exclude_none=True)
        updates.pop("base_revision", None)
        for key, value in updates.items():
            if key in _PATCHABLE:
                project[key] = value
        project["updated_at"] = _now_ms()
        project["revision"] = current + 1
        _save(projects)
        return {"project": _record(project)}


@router.delete("/projects/{project_id}")
def archive_project_v2(project_id: str) -> Dict:
    if project_id == DEFAULT_PROJECT_ID:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=422,
            title="Default project protected",
            detail="默认项目不可归档（旧前端依赖其存在）",
            field_errors={"id": "default project cannot be archived"},
        )
    with _PROJECTS_LOCK:
        projects = _load()
        project = next((p for p in projects if p.get("id") == project_id), None)
        if project is None:
            raise V2Error(
                code=ErrorCode.PROJECT_NOT_FOUND,
                status=404,
                title="Project not found",
                detail=f"项目 {project_id} 不存在",
            )
        project["archived"] = True
        project["archived_at"] = _now_ms()
        project["revision"] = project.get("revision", 1) + 1
        project["updated_at"] = _now_ms()
        _save(projects)
        return {"project": _record(project)}


@router.post("/projects/{project_id}/restore")
def restore_project_v2(project_id: str) -> Dict:
    with _PROJECTS_LOCK:
        projects = _load()
        project = next((p for p in projects if p.get("id") == project_id), None)
        if project is None:
            raise V2Error(
                code=ErrorCode.PROJECT_NOT_FOUND,
                status=404,
                title="Project not found",
                detail=f"项目 {project_id} 不存在",
            )
        project["archived"] = False
        project["archived_at"] = None
        project["revision"] = project.get("revision", 1) + 1
        project["updated_at"] = _now_ms()
        _save(projects)
        return {"project": _record(project)}
