"""SQLite 初始化基础设施测试。

契约（P0）：库文件 data/studio-v2/studio.db；PRAGMA foreign_keys=ON、WAL、
synchronous=NORMAL、busy_timeout=5000；ID 为带类型前缀的 UUIDv4。
"""

import uuid

import pytest

from API.v2 import db


def test_init_db_creates_database_with_pragmas(tmp_path):
    """初始化后建库成功，且外键、WAL、busy_timeout 生效（连接级）。"""
    db_path = tmp_path / "studio.db"
    db.init_db(db_path=str(db_path))
    assert db_path.exists()
    conn = db.get_connection(db_path=str(db_path))
    try:
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
        assert conn.execute("PRAGMA synchronous").fetchone()[0] == 1  # NORMAL
        busy = conn.execute("PRAGMA busy_timeout").fetchone()[0]
        assert busy >= 5000
    finally:
        conn.close()


def test_init_db_is_idempotent(tmp_path):
    """重复初始化不报错、不破坏已有库。"""
    db_path = tmp_path / "studio.db"
    db.init_db(db_path=str(db_path))
    conn = db.get_connection(db_path=str(db_path))
    conn.execute("CREATE TABLE IF NOT EXISTS smoke_check (id INTEGER PRIMARY KEY)")
    conn.execute("INSERT INTO smoke_check (id) VALUES (1)")
    conn.commit()
    conn.close()
    db.init_db(db_path=str(db_path))  # 重复初始化
    conn = db.get_connection(db_path=str(db_path))
    try:
        assert conn.execute("SELECT id FROM smoke_check").fetchone()[0] == 1
    finally:
        conn.close()


def test_new_id_has_type_prefix_and_uuid_format():
    """ID 形如 {prefix}_{uuid4()}，且全局唯一。"""
    ids = {db.new_id("prj") for _ in range(100)}
    assert len(ids) == 100
    for value in ids:
        prefix, _, rest = value.partition("_")
        assert prefix == "prj"
        assert rest and len(rest) == 32  # uuid4 hex 无连字符
        uuid.UUID(rest)


def test_new_id_rejects_empty_prefix():
    """空前缀应报错，避免生成无类型标识的 ID。"""
    with pytest.raises(ValueError):
        db.new_id("")
