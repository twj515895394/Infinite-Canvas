"""Studio V2 /api/v2 契约基础设施测试。

测试通过公共接口（HTTP + 结构化错误响应）验证行为，不依赖内部实现。
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from API.v2.problems import V2Error, ApiProblem, api_problem_exception_handler, ErrorCode


def _make_app() -> FastAPI:
    app = FastAPI()
    app.add_exception_handler(V2Error, api_problem_exception_handler)

    @app.get("/v2/test-ok")
    def ok():
        return {"ok": True}

    @app.get("/v2/test-not-found")
    def not_found():
        raise V2Error(
            code=ErrorCode.PROJECT_NOT_FOUND,
            status=404,
            title="Project not found",
            detail="项目不存在",
        )

    @app.post("/v2/test-conflict")
    def conflict(payload: dict):
        raise V2Error(
            code=ErrorCode.CANVAS_REVISION_CONFLICT,
            status=409,
            title="Revision conflict",
            detail="画布已被其他会话修改",
            retryable=False,
            context={"current_revision": 42},
        )

    return app


def test_problem_json_shape_and_content_type():
    """V2Error 必须以 application/problem+json 渲染，且字段完整可机读。"""
    client = TestClient(_make_app())
    resp = client.get("/v2/test-not-found")
    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("application/problem+json")
    body = resp.json()
    assert body["status"] == 404
    assert body["code"] == "PROJECT_NOT_FOUND"
    assert body["title"]
    assert body["detail"] == "项目不存在"
    # 可机读字段存在
    for key in ("type", "request_id", "retryable"):
        assert key in body


def test_problem_context_and_retryable():
    """冲突错误携带 context 与 retryable 标志，客户端可据此决定重试策略。"""
    client = TestClient(_make_app())
    resp = client.post("/v2/test-conflict", json={})
    assert resp.status_code == 409
    body = resp.json()
    assert body["code"] == "CANVAS_REVISION_CONFLICT"
    assert body["retryable"] is False
    assert body["context"] == {"current_revision": 42}


def test_ok_response_not_affected():
    """非错误响应保持普通 JSON，不经过 problem 模型。"""
    client = TestClient(_make_app())
    resp = client.get("/v2/test-ok")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
