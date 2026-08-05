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
    # Canvas V2：画布元数据 + 最新快照（B3）
    """
    CREATE TABLE IF NOT EXISTS canvases (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL
    )
    """,
    # Canvas V2：增量操作历史（B3），operation_id 幂等去重
    """
    CREATE TABLE IF NOT EXISTS canvas_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        canvas_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        base_revision INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (canvas_id, operation_id)
    )
    """,
    # Asset V2（B5）：逻辑资源元数据，current_version_id 指向 asset_versions
    """
    CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL,
        lifecycle_status TEXT NOT NULL DEFAULT 'active',
        review_status TEXT NOT NULL DEFAULT 'unreviewed',
        current_version_id TEXT,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        trashed_at INTEGER,
        deleted_at INTEGER
    )
    """,
    # Asset V2：不可变版本（B5）。内容字段创建后禁止修改（代码层约束，无更新端点）
    """
    CREATE TABLE IF NOT EXISTS asset_versions (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        version_no INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        content_url TEXT NOT NULL,
        preview_url TEXT,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        duration_ms INTEGER,
        checksum TEXT NOT NULL DEFAULT '',
        source_metadata_json TEXT NOT NULL DEFAULT '{}',
        derivation_type TEXT NOT NULL DEFAULT 'original',
        parent_version_id TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE (asset_id, version_no),
        FOREIGN KEY (asset_id) REFERENCES assets(id)
    )
    """,
    # Asset V2：标签（MVP 全局标签，不区分项目）
    """
    CREATE TABLE IF NOT EXISTS asset_tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        normalized_name TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
    )
    """,
    # Asset V2：资产-标签关联
    """
    CREATE TABLE IF NOT EXISTS asset_tag_links (
        asset_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (asset_id, tag_id),
        FOREIGN KEY (asset_id) REFERENCES assets(id),
        FOREIGN KEY (tag_id) REFERENCES asset_tags(id)
    )
    """,
    # Asset V2：集合（取代旧 Library/Category 嵌套 JSON）
    """
    CREATE TABLE IF NOT EXISTS asset_collections (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'manual',
        sort_order INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )
    """,
    # Asset V2：集合成员
    """
    CREATE TABLE IF NOT EXISTS asset_collection_members (
        collection_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (collection_id, asset_id),
        FOREIGN KEY (collection_id) REFERENCES asset_collections(id),
        FOREIGN KEY (asset_id) REFERENCES assets(id)
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
