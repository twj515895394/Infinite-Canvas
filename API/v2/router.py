"""Studio V2 API 路由聚合：所有 /api/v2 端点经 v2_router 挂载。"""

from fastapi import APIRouter

from API.v2.bootstrap import router as bootstrap_router
from API.v2.projects import router as projects_router
from API.v2.canvases import router as canvases_router

v2_router = APIRouter(prefix="/api/v2")

v2_router.include_router(bootstrap_router)
v2_router.include_router(projects_router)
v2_router.include_router(canvases_router)
