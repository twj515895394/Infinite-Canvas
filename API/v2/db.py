"""Studio V2 SQLite 基础设施。

契约（P0）：库文件 data/studio-v2/studio.db；PRAGMA foreign_keys=ON、WAL、
synchronous=NORMAL、busy_timeout=5000；ID 为带类型前缀的 UUIDv4。
连接为每线程独立（sqlite3 线程语义），统一经 get_connection 创建。
"""

import os
import sqlite3
import threading
import uuid
from typing import Optional

DEFAULT_DB_REL = os.path.join("data", "studio-v2", "studio.db")

# 每线程连接缓存，避免线程间共享 sqlite3.Connection
_thread_local = threading.local()

# 业务表在此集中注册：各领域模块（assets/agents/canvases...）以 CREATE TABLE IF NOT EXISTS 追加
BASE_SCHEMA = [
    # 迁移/元信息表：记录 schema 版本，便于后续增量演进
    """
    CREATE TABLE IF NOT EXISTS studio_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """,
]


def default_db_path() -> str:
    """仓库根目录下的默认库路径（data/studio-v2/studio.db）。"""
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(root, DEFAULT_DB_REL)


def _connect(path: str) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def _is_closed(conn: sqlite3.Connection) -> bool:
    try:
        conn.execute("SELECT 1")
        return False
    except sqlite3.ProgrammingError:
        return True


def get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """获取当前线程的 SQLite 连接（带 P0 PRAGMA）；被外部关闭后自动重建。"""
    path = db_path or default_db_path()
    cache_key = os.path.abspath(path)
    conn = getattr(_thread_local, cache_key, None)
    if conn is None or _is_closed(conn):
        conn = _connect(path)
        setattr(_thread_local, cache_key, conn)
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """初始化库：建目录、建表（幂等）。"""
    conn = get_connection(db_path=db_path)
    for statement in BASE_SCHEMA:
        conn.execute(statement)
    conn.commit()


def new_id(prefix: str) -> str:
    """生成带类型前缀的 UUIDv4 ID，如 prj_<uuid4hex>。"""
    if not prefix:
        raise ValueError("ID prefix must not be empty")
    return f"{prefix}_{uuid.uuid4().hex}"
