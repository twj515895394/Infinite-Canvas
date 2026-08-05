"""游标分页基础设施测试。

契约（P0）：PageInfo{next_cursor, has_more, limit, total}；
limit 默认 50、最大 200；集合返回空数组而非 null。
"""

import base64

from fastapi import FastAPI
from fastapi.testclient import TestClient

from API.v2.pagination import build_page, page_params
from API.v2.problems import V2Error, api_problem_exception_handler


def _make_app() -> FastAPI:
    app = FastAPI()
    app.add_exception_handler(V2Error, api_problem_exception_handler)
    DATA = [f"item-{i}" for i in range(120)]

    @app.get("/v2/page")
    def page(limit: int | None = None, cursor: str | None = None):
        limit, offset = page_params(limit, cursor)
        items = DATA[offset : offset + limit]
        total = len(DATA)
        return build_page(items=items, total=total, limit=limit, cursor=cursor)

    @app.get("/v2/empty")
    def empty(limit: int | None = None, cursor: str | None = None):
        limit, offset = page_params(limit, cursor)
        return build_page(items=[], total=0, limit=limit, cursor=cursor)

    return app


def test_page_default_limit_50():
    """未传 limit 时默认 50，且 PageInfo 字段齐全。"""
    client = TestClient(_make_app())
    resp = client.get("/v2/page")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 50
    page = body["page"]
    assert page["limit"] == 50
    assert page["total"] == 120
    assert page["has_more"] is True
    assert page["next_cursor"]  # 有更多数据时必须给出不透明游标


def test_page_cursor_pagination_round_trip():
    """用 next_cursor 翻页直到 has_more=false，能取完所有数据且无重复。"""
    client = TestClient(_make_app())
    seen = []
    cursor = None
    pages = 0
    while True:
        resp = client.get("/v2/page", params={"limit": 30, "cursor": cursor} if cursor else {"limit": 30})
        body = resp.json()
        seen.extend(body["items"])
        pages += 1
        if not body["page"]["has_more"]:
            assert body["page"]["next_cursor"] is None
            break
        cursor = body["page"]["next_cursor"]
        assert pages < 10  # 防死循环
    assert seen == [f"item-{i}" for i in range(120)]
    assert pages == 4


def test_page_limit_exceeds_max_returns_422():
    """limit 超过 200 返回 422 VALIDATION_FAILED 而非静默截断。"""
    client = TestClient(_make_app())
    resp = client.get("/v2/page", params={"limit": 999})
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "VALIDATION_FAILED"
    assert "limit" in (body.get("field_errors") or {})


def test_empty_page_returns_empty_array():
    """空集合返回 items=[]、has_more=false，而非 null。"""
    client = TestClient(_make_app())
    body = client.get("/v2/empty").json()
    assert body["items"] == []
    assert body["page"] == {"next_cursor": None, "has_more": False, "limit": 50, "total": 0}
