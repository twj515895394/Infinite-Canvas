"""Agent Profile 与 Skill 管理测试（切片 07 B7）。

契约（issue 07 验收 + P0 §10.2-10.4）：
- Agent Profile CRUD + 复制 + 启用/禁用；绑定 Runtime 正确；更新创建新 Revision。
- Skill discover/import（目录/ZIP）、manifest 校验错误、enable/disable、版本激活。
- Skill 绑定 Agent（GET/POST/PATCH/DELETE）。
- 404 AGENT_PROFILE_NOT_FOUND / SKILL_NOT_FOUND。
- ZIP 安全解压（zip-slip 拒绝）。
"""

import io
import json
import sys
import zipfile
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from API.v2 import db
from API.v2.agent_profiles import router as profiles_router
from API.v2.agent_runtimes import router as runtimes_router
from API.v2.agent_skills import router as skills_router, set_skill_roots
from API.v2.agent_tasks import router as tasks_router
from API.v2.problems import V2Error, api_problem_exception_handler

app = FastAPI()
app.include_router(runtimes_router, prefix="/api/v2")
app.include_router(profiles_router, prefix="/api/v2")
app.include_router(skills_router, prefix="/api/v2")
app.include_router(tasks_router, prefix="/api/v2")
app.add_exception_handler(V2Error, api_problem_exception_handler)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "default_db_path", lambda: str(tmp_path / "studio.db"))
    db.init_db()
    skills = tmp_path / "skills"
    set_skill_roots(
        root=str(skills),
        install=str(skills / "installed"),
        quarantine=str(skills / "quarantine"),
    )
    return TestClient(app)


def _runtime(client, **overrides):
    resp = client.post(
        "/api/v2/agent-runtimes",
        json={"name": "Codex", "adapter_type": "cli-stdio", "executable_path": "codex", **overrides},
    )
    return resp.json()["runtime"]


def _agent(client, runtime_id, **overrides):
    body = {"name": "Storyteller", "slug": "storyteller", "runtime_profile_id": runtime_id, **overrides}
    resp = client.post("/api/v2/agent-profiles", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()["agent"]


def _skill_package_bytes(skill_key="refiner", version="1.0.0", name="Refiner"):
    """构造合法 Skill 包目录字节（skill.yaml + SKILL.md）。"""
    yaml = f"skill_key: {skill_key}\nname: {name}\nversion: {version}\ndescription: 测试技能\nexecution_mode: prompt\n"
    md = f"# {name}\n\n执行说明。\n"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("skill.yaml", yaml)
        zf.writestr("SKILL.md", md)
    return buf.getvalue()


# ---------- Agent CRUD ----------


def test_agent_create_and_list(client):
    runtime = _runtime(client)
    agent = _agent(client, runtime["id"])
    assert agent["id"].startswith("agt_")
    assert agent["slug"] == "storyteller"
    assert agent["runtime_profile"]["id"] == runtime["id"]
    assert agent["current_revision"] == 1
    assert agent["instructions"] == ""
    listed = client.get("/api/v2/agent-profiles").json()["items"]
    assert [a["id"] for a in listed] == [agent["id"]]


def test_agent_create_requires_runtime(client):
    resp = client.post(
        "/api/v2/agent-profiles",
        json={"name": "X", "slug": "x", "runtime_profile_id": "rtp_nope"},
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "AGENT_RUNTIME_NOT_FOUND"


def test_agent_create_duplicate_slug_rejected(client):
    runtime = _runtime(client)
    _agent(client, runtime["id"])
    resp = client.post(
        "/api/v2/agent-profiles",
        json={"name": "Other", "slug": "storyteller", "runtime_profile_id": runtime["id"]},
    )
    assert resp.status_code == 409


def test_agent_update_creates_revision(client):
    runtime = _runtime(client)
    agent = _agent(client, runtime["id"])
    resp = client.patch(
        f"/api/v2/agent-profiles/{agent['id']}",
        json={"base_revision": 1, "instructions": "你是资深编剧", "enabled": False},
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()["agent"]
    assert updated["instructions"] == "你是资深编剧"
    assert updated["enabled"] is False
    assert updated["current_revision"] == 2
    # Revision 历史保留
    revs = client.get(f"/api/v2/agent-profiles/{agent['id']}/revisions").json()["items"]
    assert [r["revision"] for r in revs] == [2, 1]
    # 错误 CAS → 409
    resp2 = client.patch(
        f"/api/v2/agent-profiles/{agent['id']}",
        json={"base_revision": 1, "instructions": "冲突"},
    )
    assert resp2.status_code == 409
    assert resp2.json()["code"] == "REVISION_CONFLICT"


def test_agent_duplicate(client):
    runtime = _runtime(client)
    agent = _agent(client, runtime["id"], instructions="原始指令")
    dup = client.post(f"/api/v2/agent-profiles/{agent['id']}/duplicate").json()["agent"]
    assert dup["id"] != agent["id"]
    assert dup["name"] == "Storyteller 副本"
    assert dup["instructions"] == "原始指令"
    assert dup["slug"] != agent["slug"]


def test_agent_soft_delete(client):
    runtime = _runtime(client)
    agent = _agent(client, runtime["id"])
    resp = client.delete(f"/api/v2/agent-profiles/{agent['id']}")
    assert resp.status_code == 200
    assert client.get(f"/api/v2/agent-profiles/{agent['id']}").status_code == 404


def test_agent_404(client):
    assert client.get("/api/v2/agent-profiles/agt_nope").status_code == 404


def test_agent_validate(client):
    runtime = _runtime(client)
    agent = _agent(client, runtime["id"])
    result = client.post(f"/api/v2/agent-profiles/{agent['id']}/validate").json()
    assert result["ok"] is True
    assert result["missing_requirements"] == []


# ---------- Skill ----------


def test_skill_import_from_zip(client, tmp_path):
    resp = client.post(
        "/api/v2/skills/import",
        files={"file": ("refiner.zip", _skill_package_bytes(), "application/zip")},
    )
    assert resp.status_code == 200, resp.text
    skill = resp.json()["skill"]
    assert skill["skill_key"] == "refiner"
    assert skill["active_version"] == "1.0.0"
    # 版本列表
    versions = client.get(f"/api/v2/skills/{skill['id']}/versions").json()["items"]
    assert [v["version"] for v in versions] == ["1.0.0"]
    # 文件确实落盘
    installed = tmp_path / "skills" / "installed" / "refiner" / "1.0.0"
    assert (installed / "skill.yaml").exists()
    assert (installed / "SKILL.md").exists()


def test_skill_import_duplicate_version_rejected(client):
    client.post("/api/v2/skills/import", files={"file": ("r.zip", _skill_package_bytes(), "application/zip")})
    resp = client.post("/api/v2/skills/import", files={"file": ("r.zip", _skill_package_bytes(), "application/zip")})
    assert resp.status_code == 409
    assert resp.json()["code"] == "SKILL_VERSION_EXISTS"


def test_skill_import_missing_skill_md_rejected(client):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("skill.yaml", "skill_key: bad\nname: Bad\nversion: 1.0.0\n")
    resp = client.post("/api/v2/skills/import", files={"file": ("bad.zip", buf.getvalue(), "application/zip")})
    assert resp.status_code == 400
    assert resp.json()["code"] == "SKILL_PACKAGE_INVALID"
    # 失败包不留下半安装状态
    assert client.get("/api/v2/skills").json()["items"] == []


def test_skill_import_missing_manifest_field_rejected(client):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("skill.yaml", "name: NoKey\nversion: 1.0.0\n")
        zf.writestr("SKILL.md", "doc")
    resp = client.post("/api/v2/skills/import", files={"file": ("bad.zip", buf.getvalue(), "application/zip")})
    assert resp.status_code == 422
    assert resp.json()["code"] == "SKILL_MANIFEST_INVALID"


def test_skill_import_zip_slip_rejected(client, tmp_path):
    """zip-slip：../ 逃逸成员必须被拒绝（不写入目标目录外）。"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("skill.yaml", "skill_key: evil\nname: Evil\nversion: 1.0.0\n")
        zf.writestr("SKILL.md", "doc")
        zf.writestr("../escape.txt", "pwned")
    resp = client.post("/api/v2/skills/import", files={"file": ("evil.zip", buf.getvalue(), "application/zip")})
    # 危险成员被跳过，包本身合法可导入（escape.txt 不落盘）
    assert resp.status_code == 200, resp.text
    assert not (tmp_path / "escape.txt").exists()
    installed = tmp_path / "skills" / "installed" / "evil" / "1.0.0"
    assert not (installed / ".." / "escape.txt").exists()


def test_skill_import_from_local_dir(client, tmp_path):
    pkg = tmp_path / "local-skill"
    pkg.mkdir(parents=True)
    (pkg / "skill.yaml").write_text("skill_key: local\nname: Local\nversion: 0.1.0\nexecution_mode: prompt\n", encoding="utf-8")
    (pkg / "SKILL.md").write_text("# Local\n", encoding="utf-8")
    resp = client.post("/api/v2/skills/import", data={"path": str(pkg)})
    assert resp.status_code == 200, resp.text
    assert resp.json()["skill"]["skill_key"] == "local"


def test_skill_enable_disable_and_activate(client):
    skill = client.post(
        "/api/v2/skills/import", files={"file": ("r.zip", _skill_package_bytes(), "application/zip")}
    ).json()["skill"]
    disabled = client.post(f"/api/v2/skills/{skill['id']}/disable").json()["skill"]
    assert disabled["enabled"] is False
    enabled = client.post(f"/api/v2/skills/{skill['id']}/enable").json()["skill"]
    assert enabled["enabled"] is True
    # 导入第二个版本并激活
    v2 = _skill_package_bytes(version="2.0.0")
    imported = client.post("/api/v2/skills/import", files={"file": ("r2.zip", v2, "application/zip")}).json()["skill"]
    versions = client.get(f"/api/v2/skills/{skill['id']}/versions").json()["items"]
    v2_id = next(v["id"] for v in versions if v["version"] == "2.0.0")
    activated = client.post(f"/api/v2/skills/{skill['id']}/versions/{v2_id}/activate").json()["skill"]
    assert activated["active_version"] == "2.0.0"
    assert imported["id"] == skill["id"]


def test_skill_404(client):
    assert client.get("/api/v2/skills/skl_nope").status_code == 404
    assert client.get("/api/v2/skills/skl_nope/versions").status_code == 404


def test_skill_discover_scans_installed(client, tmp_path):
    # 手工放置已安装包再 discover
    installed = tmp_path / "skills" / "installed" / "manual"
    installed.mkdir(parents=True)
    (installed / "skill.yaml").write_text("skill_key: manual\nname: Manual\nversion: 3.0.0\n", encoding="utf-8")
    (installed / "SKILL.md").write_text("# Manual\n", encoding="utf-8")
    result = client.post("/api/v2/skills/discover").json()
    assert any(d["skill_key"] == "manual" for d in result["discovered"])


# ---------- Skill 绑定 Agent ----------


def test_bind_skill_to_agent(client):
    runtime = _runtime(client)
    agent = _agent(client, runtime["id"])
    skill = client.post(
        "/api/v2/skills/import", files={"file": ("r.zip", _skill_package_bytes(), "application/zip")}
    ).json()["skill"]
    resp = client.post(
        f"/api/v2/agent-profiles/{agent['id']}/skills",
        json={"skill_id": skill["id"], "version_constraint": "^1.0.0", "priority": 10},
    )
    assert resp.status_code == 200, resp.text
    binding = resp.json()["binding"]
    assert binding["skill"]["id"] == skill["id"]
    assert binding["version_constraint"] == "^1.0.0"
    # 重复绑定 → 409
    dup = client.post(
        f"/api/v2/agent-profiles/{agent['id']}/skills", json={"skill_id": skill["id"]}
    )
    assert dup.status_code == 409
    # Agent detail 携带绑定
    detail = client.get(f"/api/v2/agent-profiles/{agent['id']}").json()["agent"]
    assert len(detail["skill_bindings"]) == 1


def test_bind_skill_rejects_missing_skill(client):
    runtime = _runtime(client)
    agent = _agent(client, runtime["id"])
    resp = client.post(
        f"/api/v2/agent-profiles/{agent['id']}/skills", json={"skill_id": "skl_nope"}
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "SKILL_NOT_FOUND"


def test_unbind_skill(client):
    runtime = _runtime(client)
    agent = _agent(client, runtime["id"])
    skill = client.post(
        "/api/v2/skills/import", files={"file": ("r.zip", _skill_package_bytes(), "application/zip")}
    ).json()["skill"]
    binding = client.post(
        f"/api/v2/agent-profiles/{agent['id']}/skills", json={"skill_id": skill["id"]}
    ).json()["binding"]
    resp = client.delete(f"/api/v2/agent-profiles/{agent['id']}/skills/{binding['id']}")
    assert resp.status_code == 200
    assert client.get(f"/api/v2/agent-profiles/{agent['id']}/skills").json()["items"] == []


def test_patch_binding(client):
    runtime = _runtime(client)
    agent = _agent(client, runtime["id"])
    skill = client.post(
        "/api/v2/skills/import", files={"file": ("r.zip", _skill_package_bytes(), "application/zip")}
    ).json()["skill"]
    binding = client.post(
        f"/api/v2/agent-profiles/{agent['id']}/skills", json={"skill_id": skill["id"]}
    ).json()["binding"]
    resp = client.patch(
        f"/api/v2/agent-profiles/{agent['id']}/skills/{binding['id']}",
        json={"enabled": False, "priority": 5},
    )
    assert resp.status_code == 200
    updated = resp.json()["binding"]
    assert updated["enabled"] is False
    assert updated["priority"] == 5


# ---------- Agent / Skill test 端点（issue 07 验收 5） ----------


def test_agent_test_endpoint(client):
    """Agent test：复用 Task 链路同步驱动，返回执行结果或明确失败原因。"""
    from API.v2.agent_adapters import FakeAdapter, register_adapter

    runtime = _runtime(client)
    agent = _agent(client, runtime["id"])
    register_adapter("cli-stdio", FakeAdapter(result_text="测试回复"))
    resp = client.post(f"/api/v2/agent-profiles/{agent['id']}/test", json={"message": "你好"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["message"] == "测试回复"
    assert body["task"]["status"] == "succeeded"


def test_skill_test_endpoint(client):
    skill = client.post(
        "/api/v2/skills/import", files={"file": ("r.zip", _skill_package_bytes(), "application/zip")}
    ).json()["skill"]
    resp = client.post(f"/api/v2/skills/{skill['id']}/test")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["version"] == "1.0.0"
    assert body["execution_mode"] == "prompt"
    assert "执行说明" in body["instructions_preview"]
