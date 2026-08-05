"""幂等键基础设施。

契约（P0）：写请求带 Idempotency-Key；同 key 重复请求返回同一结果；
同 key 不同请求体返回 409 IDEMPOTENCY_CONFLICT。
第一版为进程内存储（个人场景可接受）；服务重启后由上层决定是否重建记录。
"""

import hashlib
import json
import threading
from typing import Any, Awaitable, Callable, Dict, Optional

from API.v2.problems import ErrorCode, V2Error


class IdempotencyStore:
    """进程内幂等记录存储（key -> {request_hash, response}）。"""

    def __init__(self) -> None:
        self._records: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

    def lookup(self, key: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._records.get(key)

    def save(self, key: str, request_hash: str, response: Any) -> None:
        with self._lock:
            self._records[key] = {"request_hash": request_hash, "response": response}

    def clear(self) -> None:
        with self._lock:
            self._records.clear()


def _request_hash(payload: Any) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


async def idempotent(
    store: IdempotencyStore,
    key: str,
    request_body: Any,
    handler: Callable[[], Awaitable[Any]],
) -> Any:
    """按幂等键执行或复用结果。

    - key 为空：直接执行，不缓存。
    - key 已存在且请求体一致：返回缓存结果。
    - key 已存在但请求体不一致：409 IDEMPOTENCY_CONFLICT。
    - key 不存在：执行并缓存。
    """
    if not key:
        return await handler()

    existing = store.lookup(key)
    if existing is not None:
        if existing["request_hash"] != _request_hash(request_body):
            raise V2Error(
                code=ErrorCode.IDEMPOTENCY_CONFLICT,
                status=409,
                title="Idempotency conflict",
                detail="同一 Idempotency-Key 已用于不同的请求体",
            )
        return existing["response"]

    response = await handler()
    store.save(key, _request_hash(request_body), response)
    return response
