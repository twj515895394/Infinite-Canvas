"""游标分页基础设施。

契约（P0）：limit 默认 50、最大 200；PageInfo{next_cursor, has_more, limit, total}；
游标不透明（客户端不得解析其含义）。
"""

import base64
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel

from API.v2.problems import ErrorCode, V2Error

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


class PageInfo(BaseModel):
    next_cursor: Optional[str] = None
    has_more: bool = False
    limit: int
    total: int


def _encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode()).decode().rstrip("=")


def _decode_cursor(cursor: Optional[str]) -> Optional[int]:
    if cursor is None:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        offset = int(base64.urlsafe_b64decode(padded).decode())
    except Exception:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=422,
            title="Invalid cursor",
            detail="游标格式无效",
            field_errors={"cursor": "invalid"},
        )
    if offset < 0:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=422,
            title="Invalid cursor",
            detail="游标偏移无效",
            field_errors={"cursor": "invalid"},
        )
    return offset


def page_params(limit: Optional[int] = None, cursor: Optional[str] = None) -> Tuple[int, Optional[int]]:
    """校验并归一化分页参数，返回 (limit, offset)。"""
    if limit is None:
        limit = DEFAULT_LIMIT
    if limit < 1 or limit > MAX_LIMIT:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=422,
            title="Invalid limit",
            detail=f"limit 必须在 1-{MAX_LIMIT} 之间",
            field_errors={"limit": f"must be 1..{MAX_LIMIT}"},
        )
    offset = _decode_cursor(cursor)
    if offset is None:
        offset = 0
    return limit, offset


def build_page(items: List[Any], total: int, limit: int, cursor: Optional[str] = None) -> Dict[str, Any]:
    """组装分页响应体 {items, page}。cursor 为请求侧原始游标（用于计算偏移）。"""
    offset = _decode_cursor(cursor) or 0
    end = offset + len(items)
    has_more = end < total
    next_cursor = _encode_cursor(end) if has_more else None
    return {
        "items": items,
        "page": PageInfo(next_cursor=next_cursor, has_more=has_more, limit=limit, total=total).model_dump(),
    }
