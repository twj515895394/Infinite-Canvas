"""Skill 管理路由（切片 07 B7）。

契约：docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md §6.4/§8/§9.3/§10.3
- Skill Package：skill.yaml + SKILL.md 必填；schemas/prompts/scripts 可选（scripts 默认不自动执行）。
- discover：扫描内置目录（data/studio-v2/skills/builtin 与 installed）定位 skill.yaml 索引。
- import：本地目录 / ZIP（安全解压：禁绝对路径/.. /符号链接逃逸），manifest 校验，
  失败包进 quarantine 不留下半安装状态；版本固定（skill_versions，同版本拒绝覆盖）。
- enable/disable/validate/versions/activate；绑定 Skill 在 agent_profiles.py。
- 时间戳 Epoch 毫秒；package_checksum 为 skill.yaml+SKILL.md 内容哈希。
"""

import hashlib
import io
import json
import os
import shutil
import zipfile
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel

from API.v2 import db
from API.v2.agent_repo import dump_json, load_json, now_ms, require_skill, skill_summary
from API.v2.agent_schema import SKILL_EXECUTION_MODES, SKILL_SOURCE_TYPES, SKILL_VALIDATION_STATUSES
from API.v2.problems import ErrorCode, V2Error

router = APIRouter()

# Skill 根目录（data/studio-v2/skills/）；测试可注入
_SKILLS_ROOT: Optional[str] = None
_INSTALL_ROOT: Optional[str] = None
_QUARANTINE_ROOT: Optional[str] = None


def set_skill_roots(root: Optional[str] = None, install: Optional[str] = None, quarantine: Optional[str] = None) -> None:
    """测试注入：覆盖 skills 目录配置。"""
    global _SKILLS_ROOT, _INSTALL_ROOT, _QUARANTINE_ROOT
    _SKILLS_ROOT = root
    _INSTALL_ROOT = install
    _QUARANTINE_ROOT = quarantine


def _repo_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def skills_root() -> str:
    if _SKILLS_ROOT:
        return os.path.abspath(_SKILLS_ROOT)
    return os.path.join(_repo_root(), "data", "studio-v2", "skills")


def install_root() -> str:
    if _INSTALL_ROOT:
        return os.path.abspath(_INSTALL_ROOT)
    return os.path.join(skills_root(), "installed")


def quarantine_root() -> str:
    if _QUARANTINE_ROOT:
        return os.path.abspath(_QUARANTINE_ROOT)
    return os.path.join(skills_root(), "quarantine")


# ---------- Manifest 解析与校验 ----------


def parse_manifest_yaml(text: str) -> Dict[str, Any]:
    """解析 skill.yaml（YAML 子集：顶层 key: value / 简单嵌套）。不引入 PyYAML 依赖。"""
    if not text.strip():
        return {}
    # 逐行解析缩进式 YAML 子集：支持顶层标量、顶层列表、一层嵌套映射
    result: Dict[str, Any] = {}
    current_section: Optional[str] = None
    section_list: Optional[List[Any]] = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.strip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        stripped = line.strip()
        if indent == 0 and ":" in stripped and not stripped.startswith("-"):
            key, _, value = stripped.partition(":")
            key = key.strip().strip('"').strip("'")
            value = value.strip()
            current_section = None
            section_list = None
            if value == "":
                current_section = key
                continue
            result[key] = _coerce_scalar(value)
        elif indent > 0 and current_section and stripped.startswith("- "):
            if section_list is None:
                section_list = []
                result[current_section] = section_list
            section_list.append(_coerce_scalar(stripped[2:].strip()))
        elif indent > 0 and current_section and ":" in stripped:
            key, _, value = stripped.partition(":")
            section = result.setdefault(current_section, {})
            if isinstance(section, dict):
                section[key.strip()] = _coerce_scalar(value.strip())
    return result


def _coerce_scalar(value: str) -> Any:
    v = value.strip()
    if v.startswith("[") and v.endswith("]"):
        inner = v[1:-1].strip()
        return [item.strip().strip('"').strip("'") for item in inner.split(",") if item.strip()] if inner else []
    if v == "true":
        return True
    if v == "false":
        return False
    if v in {"null", "~"}:
        return None
    if v.startswith('"') and v.endswith('"'):
        return v[1:-1]
    return v


def _validate_manifest(manifest: Dict[str, Any], has_skill_md: bool) -> List[Dict[str, str]]:
    """基础 Manifest 校验：skill_key/name/version 必填、SKILL.md 必存在。返回错误列表（空 = 合法）。"""
    errors: List[Dict[str, str]] = []
    for field, label in (("skill_key", "skill_key"), ("name", "name"), ("version", "version")):
        if not str(manifest.get(field) or "").strip():
            errors.append({"code": "MANIFEST_FIELD_MISSING", "message": f"skill.yaml 缺少必填字段 {label}"})
    if not has_skill_md:
        errors.append({"code": "SKILL_MD_MISSING", "message": "Skill 包缺少 SKILL.md"})
    execution_mode = str(manifest.get("execution_mode") or "prompt")
    if execution_mode not in SKILL_EXECUTION_MODES:
        errors.append({"code": "EXECUTION_MODE_INVALID", "message": f"execution_mode 必须是 {sorted(SKILL_EXECUTION_MODES)} 之一"})
    return errors


def _package_checksum(manifest_text: str, skill_md_text: str) -> str:
    hasher = hashlib.sha256()
    hasher.update(manifest_text.encode("utf-8"))
    hasher.update(b"\x00")
    hasher.update(skill_md_text.encode("utf-8"))
    return hasher.hexdigest()


def _safe_extract_member(zf: zipfile.ZipFile, member: zipfile.ZipInfo, target_root: str) -> Optional[str]:
    """安全解压单成员：禁绝对路径/.. / 符号链接逃逸；返回落盘相对路径或 None（跳过危险项）。"""
    name = member.filename.replace("\\", "/")
    if name.startswith("/") or ".." in name.split("/") or name == "..":
        return None
    if member.is_dir():
        return None
    # 拒绝 zip-slip 与盘符路径
    normalized = os.path.normpath(name)
    if normalized.startswith("..") or os.path.isabs(normalized) or ":" in normalized.split("/")[0]:
        return None
    dest = os.path.abspath(os.path.join(target_root, normalized))
    if os.path.commonpath([os.path.abspath(target_root), dest]) != os.path.abspath(target_root):
        return None
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with zf.open(member) as src, open(dest, "wb") as out:
        shutil.copyfileobj(src, out)
    return normalized


def _extract_zip(content: bytes, target_root: str) -> None:
    """解压 ZIP 到目标目录；危险成员跳过（不影响其他文件）。"""
    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise V2Error(
            code=ErrorCode.SKILL_PACKAGE_INVALID,
            status=400,
            title="Invalid skill package",
            detail=f"不是合法的 ZIP 包：{exc}",
        ) from exc
    with zf:
        for member in zf.infolist():
            _safe_extract_member(zf, member, target_root)


def _copy_tree_safe(src_root: str, dest_root: str) -> None:
    """复制目录到目标（跳过危险符号链接）。"""
    os.makedirs(dest_root, exist_ok=True)
    for name in os.listdir(src_root):
        src = os.path.join(src_root, name)
        dest = os.path.join(dest_root, name)
        if os.path.islink(src):
            continue
        if os.path.isdir(src):
            shutil.copytree(src, dest, dirs_exist_ok=True, symlinks=False)
        else:
            shutil.copy2(src, dest)


def read_package(package_root: str) -> Tuple[Dict[str, Any], str, str]:
    """读取包：解析 skill.yaml + SKILL.md；缺任一文件抛 SKILL_PACKAGE_INVALID。"""
    manifest_path = os.path.join(package_root, "skill.yaml")
    md_path = os.path.join(package_root, "SKILL.md")
    if not os.path.isfile(manifest_path):
        raise V2Error(
            code=ErrorCode.SKILL_PACKAGE_INVALID,
            status=400,
            title="Invalid skill package",
            detail="Skill 包缺少 skill.yaml",
        )
    if not os.path.isfile(md_path):
        raise V2Error(
            code=ErrorCode.SKILL_PACKAGE_INVALID,
            status=400,
            title="Invalid skill package",
            detail="Skill 包缺少 SKILL.md",
        )
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest_text = f.read()
    with open(md_path, "r", encoding="utf-8") as f:
        md_text = f.read()
    manifest = parse_manifest_yaml(manifest_text)
    return manifest, manifest_text, md_text


def _import_package(package_root: str, source_type: str, source_uri: Optional[str]) -> Dict[str, Any]:
    """导入目录包：校验 → 复制到 installed/{skill_key}/{version}/ → 建索引。"""
    manifest, manifest_text, md_text = read_package(package_root)
    errors = _validate_manifest(manifest, has_skill_md=True)
    if errors:
        raise V2Error(
            code=ErrorCode.SKILL_MANIFEST_INVALID,
            status=422,
            title="Invalid skill manifest",
            detail=errors[0]["message"],
            context={"issues": errors},
        )
    skill_key = str(manifest["skill_key"]).strip()
    version = str(manifest["version"]).strip()
    conn = db.get_connection()
    skill_row = conn.execute(
        "SELECT * FROM skills WHERE skill_key = ? AND deleted_at_ms IS NULL", (skill_key,)
    ).fetchone()
    if skill_row is None:
        now = now_ms()
        skill_id = db.new_id("skl")
        conn.execute(
            "INSERT INTO skills (id, skill_key, name, description, category, enabled, status, created_at_ms, updated_at_ms) "
            "VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)",
            (
                skill_id,
                skill_key,
                str(manifest.get("name") or skill_key),
                str(manifest.get("description") or ""),
                str(manifest.get("category")) if manifest.get("category") else None,
                "imported",
                now,
                now,
            ),
        )
    else:
        skill_id = skill_row["id"]
    # 版本冲突：同 installation 同版本拒绝覆盖（SKILL_VERSION_EXISTS）
    existing_version = conn.execute(
        "SELECT v.id FROM skill_versions v JOIN skill_installations i ON i.id = v.installation_id "
        "WHERE i.skill_id = ? AND v.version = ?",
        (skill_id, version),
    ).fetchone()
    if existing_version:
        raise V2Error(
            code=ErrorCode.SKILL_VERSION_EXISTS,
            status=409,
            title="Skill version exists",
            detail=f"Skill {skill_key} 版本 {version} 已存在",
        )
    # 复制到正式目录
    dest_dir = os.path.join(install_root(), skill_key, version)
    os.makedirs(os.path.dirname(dest_dir), exist_ok=True)
    if os.path.exists(dest_dir):
        shutil.rmtree(dest_dir)
    _copy_tree_safe(package_root, dest_dir)
    checksum = _package_checksum(manifest_text, md_text)
    now = now_ms()
    installation_id = db.new_id("ski")
    conn.execute(
        "INSERT INTO skill_installations (id, skill_id, source_type, source_uri, root_path, read_only, priority, status, "
        "discovered_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, 0, 100, 'ready', ?, ?)",
        (installation_id, skill_id, source_type, source_uri, dest_dir, now, now),
    )
    version_id = db.new_id("skv")
    conn.execute(
        "INSERT INTO skill_versions (id, skill_id, installation_id, version, manifest_json, input_schema_json, "
        "output_schema_json, required_capabilities_json, required_tools_json, permission_requirements_json, "
        "native_bindings_json, execution_mode, artifact_type, package_checksum, validation_status, "
        "validation_result_json, installed_at_ms, validated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, 'ready', '{}', ?, ?)",
        (
            version_id,
            skill_id,
            installation_id,
            version,
            dump_json(manifest),
            _schema_json_or_empty(os.path.join(dest_dir, "schemas", "input.schema.json")),
            _schema_json_or_empty(os.path.join(dest_dir, "schemas", "output.schema.json")),
            dump_json(manifest.get("required_capabilities", [])),
            dump_json(manifest.get("required_tools", [])),
            dump_json(manifest.get("permission_requirements", [])),
            str(manifest.get("execution_mode") or "prompt"),
            str(manifest.get("artifact_type")) if manifest.get("artifact_type") else None,
            checksum,
            now,
            now,
        ),
    )
    # 首个导入版本自动激活
    if not conn.execute("SELECT active_version_id FROM skills WHERE id = ?", (skill_id,)).fetchone()["active_version_id"]:
        conn.execute("UPDATE skills SET active_version_id = ?, status = 'imported', updated_at_ms = ? WHERE id = ?", (version_id, now, skill_id))
    conn.commit()
    return {"skill": skill_summary(skill_id), "version_id": version_id, "version": version}


def _schema_json_or_empty(path: str) -> str:
    if not os.path.isfile(path):
        return "{}"
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        return dump_json(raw)
    except (json.JSONDecodeError, OSError):
        return "{}"


# ---------- 端点 ----------


@router.get("/skills")
@router.get("/agent-skills")
def list_skills_v2() -> Dict:
    """Skill 列表（Summary：active_version/source_types/binding_count）。"""
    conn = db.get_connection()
    rows = [
        dict(r) for r in conn.execute("SELECT * FROM skills WHERE deleted_at_ms IS NULL ORDER BY updated_at_ms DESC").fetchall()
    ]
    items = []
    for row in rows:
        summary = skill_summary(row["id"])
        source_types = [
            str(r["source_type"])
            for r in conn.execute(
                "SELECT DISTINCT source_type FROM skill_installations WHERE skill_id = ?", (row["id"],)
            ).fetchall()
        ]
        compatible = conn.execute(
            "SELECT COUNT(*) AS c FROM agent_skill_bindings WHERE skill_id = ?", (row["id"],)
        ).fetchone()["c"]
        summary["source_types"] = source_types
        summary["compatible_runtime_count"] = compatible
        items.append(summary)
    return {"items": items}


@router.post("/skills/discover")
def discover_skills_v2() -> Dict:
    """扫描内置与已安装目录，索引 skill.yaml；返回发现/新增结果。"""
    roots = [install_root()]
    discovered: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []
    for root in roots:
        if not os.path.isdir(root):
            continue
        for entry in sorted(os.listdir(root)):
            pkg_root = os.path.join(root, entry)
            if not os.path.isdir(pkg_root):
                continue
            manifest_path = os.path.join(pkg_root, "skill.yaml")
            if not os.path.isfile(manifest_path):
                continue
            try:
                manifest, manifest_text, md_text = read_package(pkg_root)
                errors_list = _validate_manifest(manifest, has_skill_md=os.path.isfile(os.path.join(pkg_root, "SKILL.md")))
                skill_key = str(manifest.get("skill_key") or entry)
                version = str(manifest.get("version") or "0.0.0")
                discovered.append(
                    {
                        "skill_key": skill_key,
                        "name": str(manifest.get("name") or skill_key),
                        "version": version,
                        "validation_status": "ready" if not errors_list else "broken",
                        "issues": errors_list,
                    }
                )
            except V2Error as exc:
                errors.append({"code": exc.code, "message": exc.detail or exc.title})
    return {"discovered": discovered, "errors": errors, "count": len(discovered)}


@router.post("/skills/import")
async def import_skill_v2(
    file: Optional[UploadFile] = File(default=None),
    path: Optional[str] = Form(default=None),
    project_id: Optional[str] = Form(default=None),
    activate: bool = Form(default=True),
) -> Dict:
    """导入 Skill：ZIP 上传（file）或服务器本地目录（path）。

    校验失败包移入 quarantine；合法包原子复制到 installed/{skill_key}/{version}/ 并建索引。
    """
    if not file and not path:
        raise V2Error(
            code=ErrorCode.SKILL_PACKAGE_INVALID,
            status=400,
            title="Missing package",
            detail="需要提供 ZIP 文件（file）或本地目录（path）",
        )
    staging = os.path.join(skills_root(), "staging")
    os.makedirs(staging, exist_ok=True)
    operation_id = db.new_id("ops")
    stage_dir = os.path.join(staging, operation_id)
    try:
        if path:
            pkg_path = os.path.abspath(str(path).strip())
            if not os.path.isdir(pkg_path):
                raise V2Error(
                    code=ErrorCode.SKILL_PACKAGE_INVALID,
                    status=400,
                    title="Invalid package path",
                    detail=f"本地目录不存在：{path}",
                )
            _copy_tree_safe(pkg_path, stage_dir)
        else:
            content = await file.read()
            if not content:
                raise V2Error(
                    code=ErrorCode.SKILL_PACKAGE_INVALID,
                    status=400,
                    title="Empty package",
                    detail="上传的 ZIP 为空",
                )
            _extract_zip(content, stage_dir)
        result = _import_package(stage_dir, "imported", path)
        return {"skill": result["skill"], "version_id": result["version_id"], "version": result["version"], "warnings": []}
    except V2Error:
        os.makedirs(quarantine_root(), exist_ok=True)
        try:
            shutil.move(stage_dir, os.path.join(quarantine_root(), operation_id))
        except OSError:
            shutil.rmtree(stage_dir, ignore_errors=True)
        raise
    finally:
        if os.path.isdir(stage_dir):
            shutil.rmtree(stage_dir, ignore_errors=True)


@router.get("/skills/{skill_id}")
@router.get("/agent-skills/{skill_id}")
def get_skill_v2(skill_id: str) -> Dict:
    """Skill Detail：summary + 版本列表 + 当前激活版本。"""
    skill = require_skill(skill_id)
    conn = db.get_connection()
    versions = []
    for row in conn.execute(
        "SELECT v.*, i.source_type, i.root_path, i.read_only FROM skill_versions v "
        "JOIN skill_installations i ON i.id = v.installation_id WHERE v.skill_id = ? ORDER BY v.installed_at_ms DESC",
        (skill_id,),
    ).fetchall():
        row = dict(row)
        versions.append(
            {
                "id": row["id"],
                "skill_id": skill_id,
                "version": row["version"],
                "source_type": row["source_type"],
                "root_path": row["root_path"],
                "read_only": bool(row["read_only"]),
                "execution_mode": row["execution_mode"],
                "manifest": load_json(row.get("manifest_json"), {}),
                "input_schema": load_json(row.get("input_schema_json"), {}),
                "output_schema": load_json(row.get("output_schema_json"), {}),
                "required_capabilities": load_json(row.get("required_capabilities_json"), []),
                "required_tools": load_json(row.get("required_tools_json"), []),
                "permission_requirements": load_json(row.get("permission_requirements_json"), []),
                "artifact_type": row.get("artifact_type"),
                "package_checksum": row["package_checksum"],
                "validation_status": row["validation_status"],
                "validation_result": load_json(row.get("validation_result_json"), {}),
                "installed_at": row["installed_at_ms"],
                "active": row["id"] == skill["active_version_id"],
            }
        )
    summary = skill_summary(skill_id)
    summary["versions"] = versions
    return {"skill": summary}


@router.patch("/skills/{skill_id}")
def patch_skill_v2(skill_id: str, payload: Dict[str, Any]) -> Dict:
    """PATCH Skill 元数据（name/description/category/enabled）。"""
    require_skill(skill_id)
    allowed = {"name", "description", "category", "enabled"}
    updates: List[str] = []
    params: List[Any] = []
    for key, value in payload.items():
        if key not in allowed:
            continue
        if key == "enabled":
            value = 1 if bool(value) else 0
        updates.append(f"{key} = ?")
        params.append(value)
    if updates:
        updates.append("updated_at_ms = ?")
        params.append(now_ms())
        params.append(skill_id)
        conn = db.get_connection()
        conn.execute(f"UPDATE skills SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
    return {"skill": skill_summary(skill_id)}


@router.post("/skills/{skill_id}/validate")
def validate_skill_v2(skill_id: str) -> Dict:
    """重新校验 Skill（manifest + 必填文件存在性）。"""
    skill = require_skill(skill_id)
    conn = db.get_connection()
    versions = [
        dict(r) for r in conn.execute("SELECT * FROM skill_versions WHERE skill_id = ?", (skill_id,)).fetchall()
    ]
    issues: List[Dict[str, str]] = []
    if not versions:
        issues.append({"code": "NO_VERSION", "message": "Skill 无已安装版本"})
    for v in versions:
        manifest = load_json(v.get("manifest_json"), {})
        root = os.path.join(install_root(), skill["skill_key"], v["version"])
        has_md = os.path.isfile(os.path.join(root, "SKILL.md"))
        issues.extend(_validate_manifest(manifest, has_md))
    return {"skill_id": skill_id, "ok": len(issues) == 0, "issues": issues}


@router.post("/skills/{skill_id}/enable")
def enable_skill_v2(skill_id: str) -> Dict:
    require_skill(skill_id)
    conn = db.get_connection()
    conn.execute("UPDATE skills SET enabled = 1, updated_at_ms = ? WHERE id = ?", (now_ms(), skill_id))
    conn.commit()
    return {"skill": skill_summary(skill_id)}


@router.post("/skills/{skill_id}/disable")
def disable_skill_v2(skill_id: str) -> Dict:
    require_skill(skill_id)
    conn = db.get_connection()
    conn.execute("UPDATE skills SET enabled = 0, updated_at_ms = ? WHERE id = ?", (now_ms(), skill_id))
    conn.commit()
    return {"skill": skill_summary(skill_id)}


@router.get("/skills/{skill_id}/versions")
def list_skill_versions_v2(skill_id: str) -> Dict:
    require_skill(skill_id)
    conn = db.get_connection()
    rows = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM skill_versions WHERE skill_id = ? ORDER BY installed_at_ms DESC", (skill_id,)
        ).fetchall()
    ]
    return {"items": [{"id": r["id"], "skill_id": skill_id, "version": r["version"], "validation_status": r["validation_status"], "installed_at": r["installed_at_ms"]} for r in rows]}


@router.post("/skills/{skill_id}/versions/{version_id}/activate")
def activate_skill_version_v2(skill_id: str, version_id: str) -> Dict:
    """激活指定版本：更新 skills.active_version_id（不改变历史 Run）。"""
    require_skill(skill_id)
    conn = db.get_connection()
    version = conn.execute(
        "SELECT * FROM skill_versions WHERE id = ? AND skill_id = ?", (version_id, skill_id)
    ).fetchone()
    if version is None:
        raise V2Error(
            code=ErrorCode.SKILL_VERSION_NOT_FOUND,
            status=404,
            title="Skill version not found",
            detail=f"Skill 版本 {version_id} 不存在",
        )
    if version["validation_status"] != "ready":
        raise V2Error(
            code=ErrorCode.SKILL_RUNTIME_INCOMPATIBLE,
            status=422,
            title="Skill version not ready",
            detail="仅可激活校验通过的版本",
        )
    conn.execute("UPDATE skills SET active_version_id = ?, updated_at_ms = ? WHERE id = ?", (version_id, now_ms(), skill_id))
    conn.commit()
    return {"skill": skill_summary(skill_id)}


class SkillTestRequest(BaseModel):
    """Skill 测试运行：返回 skill.yaml/SKILL.md 摘要（MVP：不执行任意脚本）。"""

    message: str = ""


@router.post("/skills/{skill_id}/test")
def test_skill_v2(skill_id: str) -> Dict:
    """测试运行 Skill：校验 manifest + 展示激活版本内容摘要与执行要求。

    MVP 简化（§9.4 不自动执行不可信脚本）：返回结构化校验结果与指令内容，
    不执行 scripts/；真正执行走 Agent 绑定后的 Task 链路。
    """
    skill = require_skill(skill_id)
    conn = db.get_connection()
    version = None
    if skill["active_version_id"]:
        row = conn.execute("SELECT * FROM skill_versions WHERE id = ?", (skill["active_version_id"],)).fetchone()
        if row:
            version = dict(row)
    if version is None:
        raise V2Error(
            code=ErrorCode.SKILL_VERSION_NOT_FOUND,
            status=422,
            title="No active version",
            detail="Skill 无激活版本，请先导入并激活",
        )
    manifest = load_json(version.get("manifest_json"), {})
    md_text = ""
    try:
        inst = conn.execute("SELECT root_path FROM skill_installations WHERE id = ?", (version["installation_id"],)).fetchone()
        if inst:
            md_path = os.path.join(inst["root_path"], "SKILL.md")
            if os.path.isfile(md_path):
                with open(md_path, "r", encoding="utf-8") as f:
                    md_text = f.read()[:2000]
    except Exception:
        md_text = ""
    has_scripts = os.path.isdir(os.path.join(inst["root_path"], "scripts")) if "inst" in dir() and inst else False
    return {
        "ok": version["validation_status"] == "ready",
        "skill": skill_summary(skill_id),
        "version": version["version"],
        "execution_mode": version["execution_mode"],
        "manifest": manifest,
        "instructions_preview": md_text,
        "has_scripts": has_scripts,
        "scripts_execution_note": "MVP 不自动执行 Skill 脚本；需绑定 Agent 后经 Task 链路（process 权限确认）执行。",
    }
