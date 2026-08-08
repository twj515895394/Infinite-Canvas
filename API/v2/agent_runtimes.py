"""Agent Runtime Profile 与 Probe 路由（切片 06 B6）。

契约：docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md §6.1-6.2/§9.1/§10.1/§11
- Runtime Profile CRUD（软删除）+ 启用/禁用；唯一名称（活跃行）。
- Probe 同步执行：adapter 归一化探测结果（版本/模型/协议/capabilities/错误原因），
  单次失败不阻塞其他 Runtime；结果持久化到 agent_runtime_probes，最近结果回写 profile。
- 时间戳 Epoch 毫秒（与现有 v2 约定一致）。
- 禁用状态不参与任务分配（B8 Dispatcher 校验）。
"""

import json
import os
import shutil
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from API.v2 import db
from API.v2.agent_schema import ADAPTER_TYPES, now_ms
from API.v2.problems import ErrorCode, V2Error

router = APIRouter()

# 允许的 adapter_type → 探测命令模板（可执行文件存在性 + 版本参数）
_ADAPTER_PROBE_ARGS: Dict[str, List[str]] = {
    "cli-stdio": ["--version"],
    "cli-jsonl": ["--version"],
    "acp": ["--version"],
    "http": [],
    "embedded-tool": [],
}


class RuntimeProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    adapter_type: str = Field(min_length=1)
    executable_path: Optional[str] = None
    endpoint_url: Optional[str] = None
    default_model: Optional[str] = None
    command_template: Dict[str, Any] = Field(default_factory=dict)
    config: Dict[str, Any] = Field(default_factory=dict)
    environment_refs: Dict[str, str] = Field(default_factory=dict)
    workspace_policy: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class RuntimeProfileUpdate(BaseModel):
    base_revision: int
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    default_model: Optional[str] = None
    command_template: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None
    environment_refs: Optional[Dict[str, str]] = None
    workspace_policy: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


def _require_runtime(runtime_id: str) -> Dict[str, Any]:
    conn = db.get_connection()
    row = conn.execute(
        "SELECT * FROM agent_runtime_profiles WHERE id = ? AND deleted_at_ms IS NULL", (runtime_id,)
    ).fetchone()
    if row is None:
        raise V2Error(
            code=ErrorCode.AGENT_RUNTIME_NOT_FOUND,
            status=404,
            title="Runtime not found",
            detail=f"Agent Runtime {runtime_id} 不存在",
        )
    return dict(row)


def _load_json(value: str, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def runtime_dto(row: Dict[str, Any], with_probe: bool = True) -> Dict[str, Any]:
    """Runtime Profile 响应 DTO（Summary 语义 + 最近 probe 摘要）。"""
    capabilities = _load_json(row.get("capability_snapshot_json"), [])
    last_error = _load_json(row.get("last_probe_error_json"), None)
    dto: Dict[str, Any] = {
        "id": row["id"],
        "name": row["name"],
        "adapter_type": row["adapter_type"],
        "enabled": bool(row["enabled"]),
        "status": row["status"],
        "executable_path": row.get("executable_path"),
        "endpoint_url": row.get("endpoint_url"),
        "default_model": row.get("default_model"),
        "capabilities": capabilities,
        "revision": row["revision"],
        "last_probe_at": row.get("last_probe_at_ms"),
        "last_probe_error": last_error,
        "created_at": row["created_at_ms"],
        "updated_at": row["updated_at_ms"],
    }
    if with_probe:
        probe = _latest_probe(row["id"])
        if probe:
            dto["last_probe"] = probe
    return dto


def _latest_probe(runtime_id: str) -> Optional[Dict[str, Any]]:
    conn = db.get_connection()
    row = conn.execute(
        "SELECT * FROM agent_runtime_probes WHERE runtime_profile_id = ? ORDER BY started_at_ms DESC LIMIT 1",
        (runtime_id,),
    ).fetchone()
    if row is None:
        return None
    return probe_dto(dict(row))


def probe_dto(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "runtime_profile_id": row["runtime_profile_id"],
        "status": row["status"],
        "version": row.get("version"),
        "authenticated": bool(row["authenticated"]) if row.get("authenticated") is not None else None,
        "capabilities": _load_json(row.get("capabilities_json"), []),
        "models": _load_json(row.get("models_json"), []),
        "native_skills": _load_json(row.get("native_skills_json"), []),
        "diagnostics": _load_json(row.get("diagnostics_json"), {}),
        "error": _load_json(row.get("error_json"), None),
        "started_at": row["started_at_ms"],
        "finished_at": row.get("finished_at_ms"),
    }


def _probe_executable(profile: Dict[str, Any]) -> Dict[str, Any]:
    """CLI adapter 探测：可执行文件存在性 + 版本 + 基础能力。

    失败返回结构化原因（不抛异常），供调用方持久化；单次失败不影响其他 Runtime。
    """
    exe = str(profile.get("executable_path") or "").strip()
    if not exe:
        # 未配置可执行文件：尝试 PATH 解析 adapter 同名字面（codex → codex/codex.exe）
        fallback = "codex" if profile["adapter_type"] in ("cli-stdio", "cli-jsonl") else None
        found = shutil.which(fallback) if fallback else None
        if not found:
            return {
                "ok": False,
                "status": "unavailable",
                "error": {"code": "AGENT_RUNTIME_CONFIG_INVALID", "title": "未配置可执行文件", "detail": "请填写 executable_path"},
            }
        exe = found

    # 在 Windows 环境下，npm/nvm/pip 安装的 CLI（如 pi, codex, claude）通常是 pi.CMD / pi.bat 包装脚本。
    # 必须先通过 shutil.which(exe) 解析出完整的可执行路径（如 C:\nvm4w\nodejs\pi.CMD），
    # 否则在 Windows asyncio.create_subprocess_exec("pi", ...) 下会导致 [WinError 2] 系统找不到指定的文件。
    resolved = shutil.which(exe) if not (os.path.isabs(exe) and os.path.isfile(exe)) else exe
    if not resolved and not os.path.isfile(exe):
        return {
            "ok": False,
            "status": "unavailable",
            "error": {"code": "AGENT_RUNTIME_UNAVAILABLE", "title": "可执行文件不存在", "detail": f"{exe} 未找到"},
        }

    target_exe = resolved or exe
    args = _ADAPTER_PROBE_ARGS.get(profile["adapter_type"], [])
    version = None
    import asyncio

    async def _run() -> str:
        if not args:
            return ""
        # 优先直接调起解析后的可执行程序；若在 Windows 环境下抛出 OSError（如 WinError 2），退避使用 cmd.exe (shell=True) 调起
        try:
            proc = await asyncio.create_subprocess_exec(
                target_exe, *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        except OSError:
            if os.name == "nt":
                cmd_str = f'"{target_exe}" ' + " ".join(args)
                proc = await asyncio.create_subprocess_shell(
                    cmd_str, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
            else:
                raise
        return (stdout or stderr or b"").decode("utf-8", errors="replace").strip()

    try:
        version = asyncio.run(_run())
    except Exception as exc:
        return {
            "ok": False,
            "status": "unavailable",
            "error": {"code": "AGENT_RUNTIME_UNAVAILABLE", "title": "探测执行失败", "detail": str(exc)[:300]},
        }

    # 基础能力：CLI adapter 诚实声明（§11.4 不伪造 tool-calling/permission）
    capabilities = ["text-generation"]
    if profile["adapter_type"] in ("cli-stdio", "cli-jsonl"):
        capabilities.append("streaming")
        capabilities.append("cancellation")
    # 登录态探测（MVP 简化）：codex 检查 ~/.codex/auth.json 存在性；其他 CLI 返回 None（未知）
    authenticated = None
    exe_basename = os.path.basename(str(exe).split(".")[0]).lower()
    if exe_basename == "codex" or str(exe).lower().endswith("codex"):
        candidates = [
            os.path.join(os.path.expanduser("~"), ".codex", "auth.json"),
            os.path.join(os.environ.get("USERPROFILE", ""), ".codex", "auth.json"),
        ]
        authenticated = any(os.path.isfile(path) for path in candidates if path)
    return {"ok": True, "status": "ready", "version": version, "capabilities": capabilities, "authenticated": authenticated}


def _probe_http(profile: Dict[str, Any]) -> Dict[str, Any]:
    """HTTP adapter 探测：endpoint 可达性（GET /health 或端点本身）。"""
    endpoint = str(profile.get("endpoint_url") or "").strip()
    if not endpoint:
        return {
            "ok": False,
            "status": "unavailable",
            "error": {"code": "AGENT_RUNTIME_CONFIG_INVALID", "title": "未配置 Endpoint", "detail": "http adapter 必须提供 endpoint_url"},
        }
    try:
        import httpx

        resp = httpx.get(endpoint.rstrip("/") + "/health", timeout=5)
        ok = resp.status_code < 500
        return {
            "ok": ok,
            "status": "ready" if ok else "unavailable",
            "version": resp.headers.get("x-version"),
            "capabilities": ["text-generation", "streaming"] if ok else [],
        }
    except Exception as exc:
        return {
            "ok": False,
            "status": "unavailable",
            "error": {"code": "AGENT_RUNTIME_UNAVAILABLE", "title": "Endpoint 不可达", "detail": str(exc)[:300]},
        }


def probe_runtime(profile: Dict[str, Any]) -> Dict[str, Any]:
    """按 adapter_type 分派探测；统一返回归一化结果（成功或结构化失败）。"""
    adapter = profile["adapter_type"]
    if adapter == "http":
        return _probe_http(profile)
    return _probe_executable(profile)


@router.get("/agent-runtimes")
def list_runtimes_v2() -> Dict:
    """Runtime Profile 列表（软删除过滤，按更新时间倒序）。"""
    conn = db.get_connection()
    rows = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM agent_runtime_profiles WHERE deleted_at_ms IS NULL ORDER BY updated_at_ms DESC"
        ).fetchall()
    ]
    return {"items": [runtime_dto(r) for r in rows]}


@router.post("/agent-runtimes")
def create_runtime_v2(payload: RuntimeProfileCreate) -> Dict:
    """创建 Runtime Profile。adapter_type 必须合法；名称唯一（活跃行）。"""
    if payload.adapter_type not in ADAPTER_TYPES:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=422,
            title="Invalid adapter type",
            detail=f"adapter_type 必须是 {sorted(ADAPTER_TYPES)} 之一",
            field_errors={"adapter_type": "unknown adapter type"},
        )
    conn = db.get_connection()
    existing = conn.execute(
        "SELECT id FROM agent_runtime_profiles WHERE name = ? AND deleted_at_ms IS NULL", (payload.name,)
    ).fetchone()
    if existing:
        raise V2Error(
            code=ErrorCode.VALIDATION_FAILED,
            status=409,
            title="Runtime name exists",
            detail=f"Runtime 名称已存在：{payload.name}",
            field_errors={"name": "duplicate name"},
        )
    now = now_ms()
    runtime_id = db.new_id("rtp")
    conn.execute(
        "INSERT INTO agent_runtime_profiles (id, name, adapter_type, enabled, executable_path, endpoint_url, "
        "default_model, command_template_json, config_json, environment_refs_json, workspace_policy_json, "
        "status, revision, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', 1, ?, ?)",
        (
            runtime_id,
            payload.name.strip(),
            payload.adapter_type,
            1 if payload.enabled else 0,
            payload.executable_path,
            payload.endpoint_url,
            payload.default_model,
            _json_dump(payload.command_template),
            _json_dump(payload.config),
            _json_dump(payload.environment_refs),
            _json_dump(payload.workspace_policy),
            now,
            now,
        ),
    )
    conn.commit()
    return {"runtime": runtime_dto(_require_runtime(runtime_id))}


@router.get("/agent-runtimes/{runtime_id}")
def get_runtime_v2(runtime_id: str) -> Dict:
    return {"runtime": runtime_dto(_require_runtime(runtime_id))}


@router.patch("/agent-runtimes/{runtime_id}")
def update_runtime_v2(runtime_id: str, payload: RuntimeProfileUpdate) -> Dict:
    """更新 Runtime Profile（revision CAS；禁用状态可切换）。"""
    runtime = _require_runtime(runtime_id)
    if runtime["revision"] != payload.base_revision:
        raise V2Error(
            code=ErrorCode.REVISION_CONFLICT,
            status=409,
            title="Revision conflict",
            detail=f"Runtime 已被修改，当前 revision={runtime['revision']}",
        )
    updates: List[str] = []
    params: List[Any] = []
    if payload.name is not None:
        dup = db.get_connection().execute(
            "SELECT id FROM agent_runtime_profiles WHERE name = ? AND deleted_at_ms IS NULL AND id != ?",
            (payload.name.strip(), runtime_id),
        ).fetchone()
        if dup:
            raise V2Error(
                code=ErrorCode.VALIDATION_FAILED,
                status=409,
                title="Runtime name exists",
                detail=f"Runtime 名称已存在：{payload.name}",
                field_errors={"name": "duplicate name"},
            )
        updates.append("name = ?")
        params.append(payload.name.strip())
    for column, value in (
        ("default_model", payload.default_model),
        ("enabled", None if payload.enabled is None else (1 if payload.enabled else 0)),
    ):
        if column == "enabled" and payload.enabled is None:
            continue
        if value is not None:
            updates.append(f"{column} = ?")
            params.append(value)
    for column, value in (
        ("command_template_json", payload.command_template),
        ("config_json", payload.config),
        ("environment_refs_json", payload.environment_refs),
        ("workspace_policy_json", payload.workspace_policy),
    ):
        if value is not None:
            updates.append(f"{column} = ?")
            params.append(_json_dump(value))
    updates.append("revision = revision + 1")
    updates.append("updated_at_ms = ?")
    params.append(now_ms())
    params.append(runtime_id)
    conn = db.get_connection()
    conn.execute(f"UPDATE agent_runtime_profiles SET {', '.join(updates)} WHERE id = ? AND deleted_at_ms IS NULL", params)
    conn.commit()
    return {"runtime": runtime_dto(_require_runtime(runtime_id))}


@router.delete("/agent-runtimes/{runtime_id}")
def delete_runtime_v2(runtime_id: str) -> Dict:
    """软删除 Runtime Profile。存在绑定 Agent 时拒绝（保持引用完整性）。"""
    runtime = _require_runtime(runtime_id)
    conn = db.get_connection()
    bound = conn.execute(
        "SELECT COUNT(*) AS c FROM agent_profiles WHERE runtime_profile_id = ? AND deleted_at_ms IS NULL",
        (runtime_id,),
    ).fetchone()["c"]
    if bound > 0:
        raise V2Error(
            code=ErrorCode.AGENT_RUNTIME_IN_USE,
            status=409,
            title="Runtime in use",
            detail=f"仍有 {bound} 个 Agent 绑定该 Runtime",
        )
    now = now_ms()
    conn.execute(
        "UPDATE agent_runtime_profiles SET deleted_at_ms = ?, updated_at_ms = ? WHERE id = ?",
        (now, now, runtime_id),
    )
    conn.commit()
    return {"runtime": runtime_dto({**runtime, "deleted_at_ms": now})}


@router.post("/agent-runtimes/{runtime_id}/probe")
def probe_runtime_v2(runtime_id: str) -> Dict:
    """同步探测：adapter 归一化结果，持久化 probe 记录并回写 profile 状态。

    探测失败（如未安装/未登录）返回结构化失败原因而非 5xx，不阻塞其他 Runtime。
    """
    runtime = _require_runtime(runtime_id)
    conn = db.get_connection()
    now = now_ms()
    probe_id = db.new_id("prb")
    result = probe_runtime(runtime)
    ok = bool(result.get("ok"))
    status = result.get("status", "unavailable")
    error = result.get("error")
    capabilities = result.get("capabilities", [])
    authenticated = result.get("authenticated")
    conn.execute(
        "INSERT INTO agent_runtime_probes (id, runtime_profile_id, status, version, authenticated, "
        "capabilities_json, models_json, native_skills_json, diagnostics_json, error_json, started_at_ms, finished_at_ms) "
        "VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', '{}', ?, ?, ?)",
        (
            probe_id,
            runtime_id,
            status,
            result.get("version"),
            1 if authenticated else (0 if ok else None),
            _json_dump(capabilities),
            _json_dump(error) if error else None,
            now,
            now,
        ),
    )
    conn.execute(
        "UPDATE agent_runtime_profiles SET status = ?, capability_snapshot_json = ?, last_probe_at_ms = ?, "
        "last_probe_error_json = ?, updated_at_ms = ? WHERE id = ?",
        (status, _json_dump(capabilities), now, _json_dump(error) if error else None, now, runtime_id),
    )
    conn.commit()
    return {"probe": _latest_probe(runtime_id)}


@router.get("/agent-runtimes/{runtime_id}/probes")
def list_runtime_probes_v2(runtime_id: str, limit: int = 20) -> Dict:
    """Probe 历史（最近优先）；支持查看历史探测结果。"""
    _require_runtime(runtime_id)
    limit = max(1, min(100, limit))
    conn = db.get_connection()
    rows = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM agent_runtime_probes WHERE runtime_profile_id = ? ORDER BY started_at_ms DESC LIMIT ?",
            (runtime_id, limit),
        ).fetchall()
    ]
    return {"items": [probe_dto(r) for r in rows], "total": len(rows)}
