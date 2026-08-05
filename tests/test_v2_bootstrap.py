"""bootstrap / runtime-capabilities 端点测试。

契约：GET /api/v2/bootstrap 返回前端初始化所需配置（snake_case、ISO 8601）；
GET /api/v2/runtime-capabilities 返回探测结果聚合，无探测数据时返回空能力而非报错。
"""

from fastapi.testclient import TestClient

from API.v2.router import v2_router
from fastapi import FastAPI


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(v2_router)
    return app


def test_bootstrap_returns_initialization_config():
    """bootstrap 返回版本信息与时间戳，前端可据此初始化。"""
    client = TestClient(_make_app())
    resp = client.get("/api/v2/bootstrap")
    assert resp.status_code == 200
    body = resp.json()
    assert body["schema_version"] >= 1
    assert body["server_time"]  # ISO 8601 时间戳存在
    assert body["v2"] is True


def test_runtime_capabilities_has_structured_shape():
    """capabilities 返回结构化数组（id/available/name），probed_at 存在。"""
    client = TestClient(_make_app())
    body = client.get("/api/v2/runtime-capabilities").json()
    assert body["probed_at"]
    assert isinstance(body["capabilities"], list)
    for cap in body["capabilities"]:
        assert cap["id"]
        assert cap["name"]
        assert isinstance(cap["available"], bool)
        assert "detail" in cap


def test_runtime_capabilities_never_errors_without_probes():
    """即使没有任何 CLI 可用，也返回空能力列表而非报错。"""
    client = TestClient(_make_app())
    resp = client.get("/api/v2/runtime-capabilities")
    assert resp.status_code == 200
    assert isinstance(resp.json()["capabilities"], list)
