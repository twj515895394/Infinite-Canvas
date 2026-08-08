/**
 * Legacy Frontend Agent Center (Native ESM)
 * 转发入口：核心模块见 static/js/modules/agent-center/index.js 及其子视图组件。
 */

import { AgentCenter, globalAgentCenter, agentCenterShell } from './agent-center/index.js?v=2026.08.07.999';

export {
    AgentCenter,
    globalAgentCenter,
    agentCenterShell
};

export default agentCenterShell;
