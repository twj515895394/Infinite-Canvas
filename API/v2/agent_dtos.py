"""Agent Task/Run/Step 响应 DTO（B8，独立文件控制 agent_tasks.py 行数 ≤900）。

契约：docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md §9.8
时间戳 Epoch 毫秒；load_json 兼容 NULL/JSON 字符串。
"""

from typing import Any, Dict, Optional

from API.v2 import db
from API.v2.agent_repo import load_json


def task_dto(task: Dict[str, Any], with_runs: bool = True) -> Dict[str, Any]:
    conn = db.get_connection()
    agent = conn.execute("SELECT * FROM agent_profiles WHERE id = ?", (task["agent_profile_id"],)).fetchone()
    skill = None
    if task.get("requested_skill_id"):
        skill_row = conn.execute("SELECT * FROM skills WHERE id = ?", (task["requested_skill_id"],)).fetchone()
        if skill_row:
            skill = {
                "id": skill_row["id"],
                "skill_key": skill_row["skill_key"],
                "name": skill_row["name"],
                "description": skill_row["description"],
            }
    latest_run = None
    runs = []
    if with_runs:
        run_rows = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM agent_runs WHERE task_id = ? ORDER BY attempt DESC", (task["id"],)
            ).fetchall()
        ]
        runs = [run_dto(r) for r in run_rows]
        latest_run = runs[0] if runs else None
    else:
        if task.get("active_run_id"):
            run_row = conn.execute("SELECT * FROM agent_runs WHERE id = ?", (task["active_run_id"],)).fetchone()
            if run_row:
                latest_run = run_dto(dict(run_row))
    return {
        "id": task["id"],
        "session_id": task["session_id"],
        "project_id": task.get("project_id"),
        "agent_profile": {
            "id": task["agent_profile_id"],
            "name": agent["name"] if agent else task["agent_profile_id"],
            "slug": agent["slug"] if agent else "",
        },
        "requested_skill": skill,
        "message": task["message"],
        "status": task["status"],
        "active_run_id": task.get("active_run_id"),
        "output_policy": load_json(task.get("output_policy_json"), {}),
        "permission_policy": load_json(task.get("permission_policy_json"), {}),
        "revision": task["revision"],
        "latest_run": latest_run,
        "created_at": task["created_at_ms"],
        "updated_at": task["updated_at_ms"],
        "finished_at": task.get("finished_at_ms"),
        "error": load_json(task.get("error_json"), None),
        "runs": runs if with_runs else None,
    }


def run_dto(run: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": run["id"],
        "task_id": run["task_id"],
        "attempt": run["attempt"],
        "status": run["status"],
        "runtime_profile_id": run["runtime_profile_id"],
        "runtime_session_id": run.get("runtime_session_id"),
        "runtime_task_id": run.get("runtime_task_id"),
        "agent_profile_revision": run["agent_profile_revision"],
        "context_snapshot_id": run.get("context_snapshot_id"),
        "retry_mode": run["retry_mode"],
        "result_summary": run.get("result_summary"),
        "result": load_json(run.get("result_json"), None),
        "log_refs": {},
        "created_at": run["created_at_ms"],
        "started_at": run.get("started_at_ms"),
        "finished_at": run.get("finished_at_ms"),
        "error": load_json(run.get("error_json"), None),
    }


def step_dto(step: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": step["id"],
        "run_id": step["run_id"],
        "sequence": step["sequence"],
        "kind": step["kind"],
        "status": step["status"],
        "title": step.get("title"),
        "summary": step.get("summary"),
        "payload": load_json(step.get("payload_json"), None),
        "started_at": step.get("started_at_ms"),
        "finished_at": step.get("finished_at_ms"),
        "error": load_json(step.get("error_json"), None),
    }
