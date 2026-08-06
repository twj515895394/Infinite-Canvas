"""Asset V2 ingest 子域：四源解析、文件落盘与首个版本创建（切片 05 B5）。

职责：
- 存储路径配置（默认对齐 main.py 目录：<root>/assets/input、<root>/assets/uploads、
  <root>/data/shared_folders.json；支持测试注入）。
- 来源解析：remote_url（仅 http/https，基础 SSRF 防护）/ local_file / shared_folder_file（限允许目录）。
- 媒体元数据提取（图片 PIL 宽高、音视频 ffprobe 时长）。
- _ingest_bytes：写文件 + 事务创建 Asset 与 AssetVersion v1 + 标签。

不持有 HTTP 路由；供 assets.py（ingest/upload 端点）调用。
"""

import hashlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import time
import urllib.parse
import uuid
from typing import Any, Dict, List, Optional, Tuple

import httpx
from pydantic import BaseModel, Field
from PIL import Image
from typing import Literal

from API.v2 import db
from API.v2.asset_repo import asset_detail, content_url, preview_url, replace_tags
from API.v2.problems import ErrorCode, V2Error

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 对齐旧 /api/ai/upload 限制
_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".avif", ".svg"}
_VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v", ".flv", ".avi", ".mkv"}
_AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
_ARCHIVE_EXTS = {".zip", ".tar", ".gz", ".tgz", ".rar", ".7z"}
_DERIVATION_TYPES = frozenset(
    {
        "original",
        "replacement",
        "crop",
        "resize",
        "upscale",
        "background-remove",
        "transcode",
        "extract-frame",
        "mixdown",
        "workflow-edit",
        "other",
    }
)

# 测试注入：上传落点 / 本地素材根 / 共享目录注册文件（默认对齐 main.py 的目录）
_INPUT_DIR: Optional[str] = None
_LOCAL_DIR: Optional[str] = None
_SHARED_FOLDERS_PATH: Optional[str] = None


def set_storage_paths(
    input_dir: Optional[str] = None,
    local_dir: Optional[str] = None,
    shared_folders_path: Optional[str] = None,
) -> None:
    """测试注入：覆盖存储目录配置。"""
    global _INPUT_DIR, _LOCAL_DIR, _SHARED_FOLDERS_PATH
    if input_dir is not None:
        _INPUT_DIR = input_dir
    if local_dir is not None:
        _LOCAL_DIR = local_dir
    if shared_folders_path is not None:
        _SHARED_FOLDERS_PATH = shared_folders_path


def _repo_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def input_dir() -> str:
    if _INPUT_DIR:
        return os.path.abspath(_INPUT_DIR)
    return os.path.join(_repo_root(), "assets", "input")


def local_dir() -> str:
    if _LOCAL_DIR:
        return os.path.abspath(_LOCAL_DIR)
    return os.path.join(_repo_root(), "assets", "uploads")


def shared_folders_path() -> str:
    if _SHARED_FOLDERS_PATH:
        return _SHARED_FOLDERS_PATH
    return os.path.join(_repo_root(), "data", "shared_folders.json")


# ---------- 媒体元数据 ----------


def kind_for(filename: str, content_type: Optional[str]) -> Tuple[str, str]:
    """按扩展名 + MIME 推断 kind 与落盘扩展名（对齐旧 /api/ai/upload 逻辑）。"""
    ext = os.path.splitext(str(filename or ""))[1].lower()
    ctype = (content_type or "").lower()
    if ext in _IMAGE_EXTS or ctype.startswith("image/"):
        if ext not in _IMAGE_EXTS:
            ext = ".jpg" if "jpeg" in ctype else ".webp" if "webp" in ctype else ".gif" if "gif" in ctype else ".png"
        return "image", ext
    if ext in _VIDEO_EXTS or ctype.startswith("video/"):
        if ext not in _VIDEO_EXTS:
            ext = ".webm" if "webm" in ctype else ".mov" if "quicktime" in ctype else ".mp4"
        return "video", ext
    if ext in _AUDIO_EXTS or ctype.startswith("audio/"):
        if ext not in _AUDIO_EXTS:
            ext = ".wav" if "wav" in ctype else ".ogg" if "ogg" in ctype else ".m4a" if "mp4" in ctype else ".mp3"
        return "audio", ext
    if ext in _ARCHIVE_EXTS:
        return "archive", ext
    return "document", ext or (mimetypes.guess_extension(content_type) or ".bin")


def media_meta(path: str, kind: str) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    """提取 (width, height, duration_ms)。图片用 PIL；音视频时长用 ffprobe（缺失时忽略）。"""
    width = height = duration = None
    if kind == "image":
        try:
            with Image.open(path) as img:
                width, height = img.size
        except Exception:
            pass
    if kind in ("video", "audio"):
        ffprobe = shutil.which("ffprobe")
        if ffprobe:
            try:
                proc = subprocess.run(
                    [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path],
                    capture_output=True,
                    text=True,
                    timeout=15,
                )
                dur = float((proc.stdout or "").strip())
                if dur > 0:
                    duration = int(dur * 1000)
            except Exception:
                pass
    return width, height, duration


def safe_filename(name: str) -> str:
    """清洗展示用文件名（不用于落盘路径）。"""
    base = os.path.basename(str(name or "").strip().replace("\\", "/"))
    return re.sub(r"[\x00-\x1f<>:\"/\\|?*]", "_", base).strip(" .")[:180] or "untitled"


# ---------- 来源解析 ----------


def fetch_remote(url: str) -> bytes:
    """下载远程 URL 字节。仅允许 http/https（基础 SSRF 防护）；超限抛 413。"""
    if not str(url or "").startswith(("http://", "https://")):
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=400,
            title="Invalid remote URL",
            detail="仅支持 http/https 远程地址",
            field_errors={"sources": "url must be http(s)"},
        )
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            with client.stream("GET", url) as resp:
                resp.raise_for_status()
                chunks: List[bytes] = []
                size = 0
                for chunk in resp.iter_bytes():
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        raise V2Error(
                            code=ErrorCode.VALIDATION_FAILED,
                            status=413,
                            title="File too large",
                            detail=f"远程文件超过 {MAX_UPLOAD_BYTES // (1024 * 1024)}MB",
                        )
                    chunks.append(chunk)
                return b"".join(chunks)
    except V2Error:
        raise
    except Exception as exc:
        raise V2Error(
            code=ErrorCode.ASSET_INGEST_FAILED,
            status=400,
            title="Remote fetch failed",
            detail=f"远程下载失败：{str(exc)[:200]}",
        )


def safe_join(root: str, rel: str) -> str:
    """校验 rel 位于 root 内（防路径穿越），返回绝对路径。"""
    rel_path = str(rel or "").replace("\\", "/").strip().lstrip("/")
    norm = os.path.normpath(rel_path).replace("\\", "/")
    if norm in {"", ".", ".."} or norm.startswith("../") or os.path.isabs(norm):
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=400,
            title="Invalid path",
            detail="非法路径",
            field_errors={"sources": "path is outside allowed directory"},
        )
    path = os.path.abspath(os.path.join(os.path.abspath(root), norm))
    try:
        if os.path.commonpath([os.path.abspath(root), path]) != os.path.abspath(root):
            raise V2Error(
                code=ErrorCode.VALIDATION_FAILED,
                status=400,
                title="Invalid path",
                detail="非法路径",
                field_errors={"sources": "path is outside allowed directory"},
            )
    except ValueError:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=400,
            title="Invalid path",
            detail="非法路径",
            field_errors={"sources": "path is outside allowed directory"},
        )
    return path


def _shared_folder_root(folder_id: str) -> str:
    """按注册 ID 解析共享目录绝对路径（读取 data/shared_folders.json）。"""
    try:
        with open(shared_folders_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    for entry in data.get("folders") or []:
        if entry.get("id") == folder_id:
            return os.path.abspath(entry.get("path") or "")
    raise V2Error(
        code=ErrorCode.VALIDATION_FAILED,
        status=400,
        title="Shared folder not registered",
        detail=f"共享目录未注册：{folder_id}",
    )


class AssetIngestSource(BaseModel):
    type: Literal["remote_url", "local_file", "shared_folder_file", "local_url"]
    url: Optional[str] = None
    path: Optional[str] = None
    shared_folder_id: Optional[str] = None
    name: Optional[str] = None
    kind: Optional[str] = None


class AssetIngestRequest(BaseModel):
    project_id: Optional[str] = None
    sources: List[AssetIngestSource] = Field(min_length=1, max_length=200)
    tags: List[str] = []
    collection_id: Optional[str] = None


def local_url_to_path(url: str) -> Optional[str]:
    """本地 URL（/assets/、/output/ 前缀）→ 文件系统路径（F12 生成结果入库）。

    惰性 import main.output_file_from_url：main.py 是 19000 行历史文件，禁止新增代码，
    且 asset_ingest 被 main 挂载链导入，顶层导入会循环依赖；运行时 main 已加载，
    函数内导入安全。测试可 monkeypatch 本函数注入临时文件路径。
    """
    text = str(url or "").strip()
    if not text.startswith(("/assets/", "/output/")):
        return None
    from main import output_file_from_url  # noqa: PLC0415 惰性导入（避免循环依赖）

    return output_file_from_url(text) or None


def resolve_source(src: AssetIngestSource) -> Tuple[bytes, str, str, Dict[str, Any]]:
    """把 ingest 源解析为 (content, filename, content_type, source_metadata)。"""
    stype = src.type
    if stype == "local_url":
        if not src.url:
            raise V2Error(
                code=ErrorCode.VALIDATION_FAILED,
                status=400,
                title="Missing URL",
                detail="local_url 源必须提供 url",
            )
        text = str(src.url).strip()
        if not text.startswith(("/assets/", "/output/")):
            raise V2Error(
                code=ErrorCode.VALIDATION_FAILED,
                status=400,
                title="Invalid local URL",
                detail="local_url 仅支持 /assets/ 或 /output/ 前缀的本地输出地址",
            )
        path = local_url_to_path(text)
        if not path or not os.path.isfile(path):
            raise V2Error(
                code=ErrorCode.ASSET_INGEST_FAILED,
                status=404,
                title="Local file not found",
                detail=f"本地输出文件不存在：{text}",
            )
        with open(path, "rb") as f:
            content = f.read()
        filename = os.path.basename(path)
        return content, filename, mimetypes.guess_type(filename)[0] or "", {"url": src.url, "local_path": path}
    if stype == "remote_url":
        if not src.url:
            raise V2Error(
                code=ErrorCode.VALIDATION_FAILED,
                status=400,
                title="Missing URL",
                detail="remote_url 源必须提供 url",
            )
        content = fetch_remote(src.url)
        parsed = urllib.parse.urlparse(src.url)
        filename = os.path.basename(parsed.path) or f"remote_{uuid.uuid4().hex[:8]}.bin"
        return content, filename, mimetypes.guess_type(filename)[0] or "", {"url": src.url}
    if stype == "local_file":
        if not src.path:
            raise V2Error(
                code=ErrorCode.VALIDATION_FAILED,
                status=400,
                title="Missing path",
                detail="local_file 源必须提供 path",
            )
        path = safe_join(local_dir(), src.path)
        if not os.path.isfile(path):
            raise V2Error(
                code=ErrorCode.VALIDATION_FAILED,
                status=400,
                title="Local file not found",
                detail=f"本地素材不存在：{src.path}",
            )
        with open(path, "rb") as f:
            content = f.read()
        filename = os.path.basename(path)
        return content, filename, mimetypes.guess_type(filename)[0] or "", {"source_path": src.path}
    if stype == "shared_folder_file":
        if not src.shared_folder_id or not src.path:
            raise V2Error(
                code=ErrorCode.VALIDATION_FAILED,
                status=400,
                title="Missing shared folder info",
                detail="shared_folder_file 源必须提供 shared_folder_id 与 path",
            )
        root = _shared_folder_root(src.shared_folder_id)
        path = safe_join(root, src.path)
        if not os.path.isfile(path):
            raise V2Error(
                code=ErrorCode.VALIDATION_FAILED,
                status=400,
                title="Shared file not found",
                detail=f"共享目录文件不存在：{src.path}",
            )
        with open(path, "rb") as f:
            content = f.read()
        filename = os.path.basename(path)
        return content, filename, mimetypes.guess_type(filename)[0] or "", {
            "shared_folder_id": src.shared_folder_id,
            "path": src.path,
        }
    raise V2Error(
        code=ErrorCode.VALIDATION_FAILED,
        status=400,
        title="Unknown source type",
        detail=f"未知 ingest 源类型：{stype}",
    )


# ---------- 写入 ----------


def ingest_bytes(
    content: bytes,
    filename: str,
    content_type: Optional[str],
    project_id: Optional[str],
    name: Optional[str],
    tags: Optional[List[str]],
    source_type: str,
    source_metadata: Optional[Dict[str, Any]],
    kind: Optional[str] = None,
) -> Dict[str, Any]:
    """写入文件 + 创建 Asset 与首个 AssetVersion（同一事务）。返回资产详情 DTO。"""
    if not content:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=400,
            title="Empty file",
            detail="文件内容为空",
        )
    if len(content) > MAX_UPLOAD_BYTES:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=413,
            title="File too large",
            detail=f"文件超过 {MAX_UPLOAD_BYTES // (1024 * 1024)}MB",
        )
    if kind:
        ext = os.path.splitext(str(filename) or "")[1].lower() or ".bin"
    else:
        kind, ext = kind_for(filename, content_type)
    if not ext:
        ext = ".bin"

    stored_name = f"ast_{uuid.uuid4().hex[:12]}{ext}"
    conn = db.get_connection()
    try:
        os.makedirs(input_dir(), exist_ok=True)
        path = os.path.join(input_dir(), stored_name)
        with open(path, "wb") as f:
            f.write(content)
        checksum = hashlib.sha256(content).hexdigest()
        width, height, duration_ms = media_meta(path, kind)
        mime = content_type or mimetypes.guess_type(stored_name)[0] or "application/octet-stream"
        now = int(time.time() * 1000)
        asset_id = db.new_id("ast")
        version_id = db.new_id("avr")
        url = content_url(stored_name, input_dir())
        conn.execute(
            "INSERT INTO assets (id, project_id, kind, name, description, source_type, lifecycle_status, "
            "review_status, current_version_id, revision, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, '', ?, 'active', 'unreviewed', ?, 1, ?, ?)",
            (asset_id, project_id, kind, name or safe_filename(filename), source_type, version_id, now, now),
        )
        conn.execute(
            "INSERT INTO asset_versions (id, asset_id, version_no, file_path, content_url, preview_url, mime_type, "
            "size_bytes, width, height, duration_ms, checksum, source_metadata_json, derivation_type, parent_version_id, created_at) "
            "VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'original', NULL, ?)",
            (
                version_id,
                asset_id,
                stored_name,
                url,
                preview_url(url, kind),
                mime,
                len(content),
                width,
                height,
                duration_ms,
                checksum,
                json.dumps(source_metadata or {}, ensure_ascii=False),
                now,
            ),
        )
        replace_tags(conn, asset_id, tags)
        conn.commit()
    except Exception:
        conn.rollback()
        try:
            os.remove(path)
        except OSError:
            pass
        raise V2Error(
            code=ErrorCode.ASSET_INGEST_FAILED,
            status=500,
            title="Ingest failed",
            detail="创建资产记录失败",
            retryable=True,
        )
    return asset_detail(asset_id)


def valid_derivation_type(value: str) -> str:
    """规范化 derivation_type（非法值回落 other）。"""
    return value if value in _DERIVATION_TYPES else "other"
