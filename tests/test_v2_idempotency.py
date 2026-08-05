"""幂等键基础设施测试。

契约（P0）：写请求带 Idempotency-Key；同 key 重复请求返回同一结果；
同 key 不同请求体返回 409 IDEMPOTENCY_CONFLICT。
"""

import threading

from fastapi import FastAPI, Header
from fastapi.testclient import TestClient

from API.v2.idempotency import IdempotencyStore, idempotent
from API.v2.problems import V2Error, api_problem_exception_handler


def _make_app() -> FastAPI:
    app = FastAPI()
    app.add_exception_handler(V2Error, api_problem_exception_handler)
    store = IdempotencyStore()
    counter = {"n": 0}
    lock = threading.Lock()

    @app.post("/v2/idem")
    async def idem(payload: dict, idempotency_key: str = Header(default="")):
        async def run():
            # 副作用必须在 handler 内：幂等命中时不执行，从而不产生新结果
            with lock:
                counter["n"] += 1
                n = counter["n"]
            return {"result_id": f"res-{n}", "echo": payload.get("echo")}

        return await idempotent(store, idempotency_key, payload, run)

    return app, counter


def test_same_key_returns_same_result_without_reexecution():
    """同 key 重复提交返回同一 result_id，且处理器只执行一次。"""
    app, counter = _make_app()
    client = TestClient(app)
    first = client.post("/v2/idem", json={"echo": "a"}, headers={"Idempotency-Key": "k1"})
    assert first.status_code == 200
    second = client.post("/v2/idem", json={"echo": "a"}, headers={"Idempotency-Key": "k1"})
    assert second.status_code == 200
    assert second.json() == first.json()
    assert counter["n"] == 1  # 处理器未重复执行


def test_different_key_reexecutes():
    """不同 key 各自独立执行。"""
    app, counter = _make_app()
    client = TestClient(app)
    client.post("/v2/idem", json={}, headers={"Idempotency-Key": "k1"})
    client.post("/v2/idem", json={}, headers={"Idempotency-Key": "k2"})
    assert counter["n"] == 2


def test_same_key_different_body_conflicts():
    """同 key 不同请求体返回 409 IDEMPOTENCY_CONFLICT，防止滥用同一 key 提交不同操作。"""
    app, _ = _make_app()
    client = TestClient(app)
    client.post("/v2/idem", json={"echo": "a"}, headers={"Idempotency-Key": "k1"})
    resp = client.post("/v2/idem", json={"echo": "b"}, headers={"Idempotency-Key": "k1"})
    assert resp.status_code == 409
    assert resp.json()["code"] == "IDEMPOTENCY_CONFLICT"


def test_missing_key_runs_normally():
    """无 Idempotency-Key 时每次正常执行。"""
    app, counter = _make_app()
    client = TestClient(app)
    client.post("/v2/idem", json={})
    client.post("/v2/idem", json={})
    assert counter["n"] == 2
