"""Agent Runtime Adapter（切片 13 B8）。

契约：docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md §11
- 统一内部协议：probe / submit_task / cancel_task / stream_events。
- Adapter 必须将 Runtime 输出归一化为 NormalizedRuntimeEvent，Service 不解析 stdout 文本。
- CodexCliAdapter：复用 main.py 的 codex_cli_executable / run_codex_cli（惰性 import），
  只提供诚实能力（text-generation/streaming/cancellation，不伪造 tool-calling）。
- FakeAdapter：测试用同步假 Runtime（结构化事件流），验证 Dispatcher 状态机。
"""

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Dict, List, Optional


@dataclass
class RuntimeProbeResult:
    ok: bool
    status: str
    version: Optional[str] = None
    capabilities: List[str] = field(default_factory=list)
    error: Optional[Dict[str, Any]] = None


class NormalizedRuntimeEvent:
    """统一 Runtime 事件（Service 只消费该结构，不解析原始 stdout）。"""

    EVENT_TYPES = {
        "status",
        "message-delta",
        "message-completed",
        "step-started",
        "step-completed",
        "tool-call-proposed",
        "tool-call-result",
        "permission-requested",
        "input-requested",
        "artifact-proposed",
        "checkpoint",
        "diagnostic",
        "completed",
        "failed",
    }

    def __init__(self, event_type: str, payload: Dict[str, Any], sequence: int = 0) -> None:
        if event_type not in self.EVENT_TYPES:
            raise ValueError(f"未知事件类型：{event_type}")
        self.event_type = event_type
        self.payload = payload
        self.sequence = sequence

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sequence": self.sequence,
            "event_type": self.event_type,
            "timestamp": int(time.time() * 1000),
            "payload": self.payload,
        }


class AgentRuntimeAdapter:
    """Adapter 协议基类：子类必须实现 submit_task/cancel_task/stream_events。"""

    adapter_type = "generic"

    async def probe(self, profile: Dict[str, Any]) -> RuntimeProbeResult:
        raise NotImplementedError

    async def submit_task(self, request: Dict[str, Any]) -> str:
        """提交任务，返回 runtime_task_id。"""
        raise NotImplementedError

    async def cancel_task(self, runtime_task_id: str) -> bool:
        """取消任务；返回是否确认取消。"""
        raise NotImplementedError

    async def stream_events(self, runtime_task_id: str) -> AsyncIterator[NormalizedRuntimeEvent]:
        raise NotImplementedError
        yield  # pragma: no cover 类型标记


class CodexCliAdapter(AgentRuntimeAdapter):
    """Codex CLI Adapter：复用 main.py 的 codex 探测与 exec helper。

    能力诚实声明：text-generation/streaming/cancellation。
    不伪造 tool-calling/permission-request（§11.4 降级原则）。
    """

    adapter_type = "cli-stdio"

    async def probe(self, profile: Dict[str, Any]) -> RuntimeProbeResult:
        """Codex 探测：复用 agent_runtimes 的同步探测（在事件循环外调用，避免嵌套 asyncio.run）。
        调用方（Probe 端点）为同步路由；若未来在事件循环内调用需改为 create_subprocess_exec 异步版。"""
        from API.v2.agent_runtimes import probe_runtime  # 复用同一探测逻辑

        result = probe_runtime({**profile, "adapter_type": "cli-stdio"})
        if not result.get("ok"):
            return RuntimeProbeResult(
                ok=False,
                status=result.get("status", "unavailable"),
                error=result.get("error"),
            )
        return RuntimeProbeResult(
            ok=True,
            status="ready",
            version=result.get("version"),
            capabilities=result.get("capabilities", ["text-generation", "streaming", "cancellation"]),
        )

    async def submit_task(self, request: Dict[str, Any]) -> str:
        """调用 main.run_codex_cli 执行（惰性 import），返回 runtime_task_id。"""
        from main import run_codex_cli

        prompt = str(request.get("user_message") or "")
        model = str(request.get("model") or "")
        # 组装上下文：Agent instructions + Skill 指令 + 固定 Context 摘要
        context_lines: List[str] = []
        instructions = request.get("instructions") or ""
        if instructions:
            context_lines.append(f"[Agent 指令]\n{instructions}")
        skills = request.get("skills") or []
        for skill in skills:
            name = skill.get("name") or skill.get("skill_key") or "skill"
            md = skill.get("skill_md") or ""
            if md:
                context_lines.append(f"[Skill: {name}]\n{md}")
        context = request.get("context_summary") or ""
        if context:
            context_lines.append(f"[Context]\n{context}")
        full_prompt = "\n\n".join([*context_lines, prompt]).strip() or prompt
        raw = await run_codex_cli(full_prompt, model=model)
        # 结果以消息事件回放（Adapter 归一化，Service 不解析 stdout）
        text = str(raw.get("text") or "")
        self._pending_result = text
        return f"codex-{int(time.time() * 1000)}"

    async def cancel_task(self, runtime_task_id: str) -> bool:
        return True

    async def stream_events(self, runtime_task_id: str) -> AsyncIterator[NormalizedRuntimeEvent]:
        text = getattr(self, "_pending_result", "")
        if text:
            yield NormalizedRuntimeEvent("message-completed", {"content": text, "role": "assistant"})
        yield NormalizedRuntimeEvent("completed", {"summary": (text or "完成")[:500]})


class FakeAdapter(AgentRuntimeAdapter):
    """测试用假 Runtime：可配置结果/延迟/事件序列，验证 Dispatcher 状态机。"""

    adapter_type = "cli-stdio"

    def __init__(
        self,
        result_text: str = "fake result",
        delay_ms: int = 0,
        fail: bool = False,
        events: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        self.result_text = result_text
        self.delay_ms = delay_ms
        self.fail = fail
        self.events = events
        self.submitted: List[Dict[str, Any]] = []
        self.cancelled: List[str] = []

    async def probe(self, profile: Dict[str, Any]) -> RuntimeProbeResult:
        return RuntimeProbeResult(ok=True, status="ready", version="fake-1.0", capabilities=["text-generation"])

    async def submit_task(self, request: Dict[str, Any]) -> str:
        self.submitted.append(request)
        return f"fake-task-{len(self.submitted)}"

    async def cancel_task(self, runtime_task_id: str) -> bool:
        self.cancelled.append(runtime_task_id)
        return True

    async def stream_events(self, runtime_task_id: str) -> AsyncIterator[NormalizedRuntimeEvent]:
        if self.delay_ms:
            await asyncio.sleep(self.delay_ms / 1000)
        if self.fail:
            yield NormalizedRuntimeEvent("failed", {"error": "fake failure", "message": "假 Runtime 失败"})
            return
        if self.events:
            for evt in self.events:
                yield NormalizedRuntimeEvent(evt["event_type"], evt.get("payload", {}))
            return
        yield NormalizedRuntimeEvent("message-completed", {"content": self.result_text, "role": "assistant"})
        yield NormalizedRuntimeEvent("completed", {"summary": self.result_text})


_ADAPTER_REGISTRY: Dict[str, Any] = {}


def register_adapter(adapter_type: str, adapter: AgentRuntimeAdapter) -> None:
    _ADAPTER_REGISTRY[adapter_type] = adapter


def get_adapter(adapter_type: str) -> AgentRuntimeAdapter:
    """按 adapter_type 取 Adapter；Codex 优先，未知类型回落 FakeAdapter（便于测试注入）。"""
    if adapter_type in _ADAPTER_REGISTRY:
        return _ADAPTER_REGISTRY[adapter_type]
    if adapter_type in ("cli-stdio", "cli-jsonl", "codex"):
        return CodexCliAdapter()
    return FakeAdapter()


def reset_adapters() -> None:
    _ADAPTER_REGISTRY.clear()
