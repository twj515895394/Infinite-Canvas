"""bootstrap 与 runtime-capabilities 端点。

bootstrap：前端初始化所需配置（版本、时间）。
runtime-capabilities：CLI/能力探测聚合；无探测数据时返回空能力而非报错。
B1 阶段仅做基础 CLI 存在性探测（which），版本与深度探测在 M3 阶段接入 Runtime Probe。
"""

import datetime
import shutil
from typing import Dict, List

from fastapi import APIRouter

SCHEMA_VERSION = 1

router = APIRouter()

# 基础 CLI 探测清单：后续 Runtime Probe 会覆盖更完整的探测逻辑
_BASIC_CLIS = [
    ("cli.codex", "Codex CLI", ("codex", "codex.exe")),
    ("cli.gemini", "Gemini CLI", ("gemini", "gemini.exe")),
    ("cli.jimeng", "即梦 CLI", ("jimeng", "jimeng.exe")),
]


def probe_cli(cli_id: str, name: str, candidates: tuple) -> Dict:
    """探测单个 CLI 是否可用（PATH 查找），不执行版本命令（避免子进程开销）。"""
    for candidate in candidates:
        path = shutil.which(candidate)
        if path:
            return {"id": cli_id, "name": name, "available": True, "detail": {"path": path}}
    return {"id": cli_id, "name": name, "available": False, "detail": {}}


def collect_capabilities() -> List[Dict]:
    return [probe_cli(cli_id, name, candidates) for cli_id, name, candidates in _BASIC_CLIS]


@router.get("/bootstrap")
def bootstrap() -> Dict:
    """前端启动配置。"""
    return {
        "schema_version": SCHEMA_VERSION,
        "server_time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "v2": True,
    }


@router.get("/runtime-capabilities")
def runtime_capabilities() -> Dict:
    """聚合当前环境可用的 CLI/能力探测结果。"""
    return {
        "probed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "capabilities": collect_capabilities(),
    }
