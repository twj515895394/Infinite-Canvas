"""Studio V2 统一错误模型（RFC 7807 problem+json）。

契约参考：docs/studio-v2-api-v2-p0-contract-and-openapi-design.md
所有 /api/v2 错误统一经 V2Error + api_problem_exception_handler 渲染，
客户端可机读 code/retryable/field_errors 决定重试与展示策略。
"""

import uuid
from typing import Any, Dict, Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


class ErrorCode:
    """P0 错误码清单（与 P0 Contract 文档一致）。"""

    VALIDATION_FAILED = "VALIDATION_FAILED"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    PROJECT_NOT_FOUND = "PROJECT_NOT_FOUND"
    CANVAS_NOT_FOUND = "CANVAS_NOT_FOUND"
    ASSET_NOT_FOUND = "ASSET_NOT_FOUND"
    ASSET_INGEST_FAILED = "ASSET_INGEST_FAILED"
    PROJECT_REVISION_CONFLICT = "PROJECT_REVISION_CONFLICT"
    CANVAS_REVISION_CONFLICT = "CANVAS_REVISION_CONFLICT"
    ASSET_IN_USE = "ASSET_IN_USE"
    IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT"
    GENERATION_PROVIDER_ERROR = "GENERATION_PROVIDER_ERROR"
    RATE_LIMITED = "RATE_LIMITED"


class ApiProblem(BaseModel):
    """统一错误响应体。"""

    type: str = "about:blank"
    title: str
    status: int
    detail: Optional[str] = None
    code: str
    request_id: Optional[str] = None
    retryable: bool = False
    field_errors: Optional[Dict[str, Any]] = None
    context: Optional[Dict[str, Any]] = None


class V2Error(Exception):
    """业务错误：由 /api/v2 路由抛出，由统一 handler 渲染为 problem+json。"""

    def __init__(
        self,
        code: str,
        status: int,
        title: str,
        detail: Optional[str] = None,
        retryable: bool = False,
        field_errors: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(detail or title)
        self.code = code
        self.status = status
        self.title = title
        self.detail = detail
        self.retryable = retryable
        self.field_errors = field_errors
        self.context = context


async def api_problem_exception_handler(request: Request, exc: V2Error) -> JSONResponse:
    """将 V2Error 渲染为 application/problem+json。"""
    problem = ApiProblem(
        title=exc.title,
        status=exc.status,
        detail=exc.detail,
        code=exc.code,
        request_id=uuid.uuid4().hex[:12],
        retryable=exc.retryable,
        field_errors=exc.field_errors,
        context=exc.context,
    )
    return JSONResponse(
        status_code=exc.status,
        content=problem.model_dump(exclude_none=True),
        headers={"Content-Type": "application/problem+json"},
    )
