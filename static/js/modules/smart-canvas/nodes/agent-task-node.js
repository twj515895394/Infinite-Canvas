/**
 * Agent Task Smart Node ESM 模块 (smart-agent-task)
 * 包含节点 config 纯函数解析、校验、上下文推导、Task 提交 Payload 构造、状态总线联动及 DOM 渲染器。
 */

import { globalNodeStatusBus } from '../core/status-bus.js';
import { nodeFactory } from './node-factory.js';

export const AGENT_TASK_NODE_TYPE = 'smart-agent-task';
const MAX_TASK_HISTORY = 10;

/**
 * 解析并标准化 Agent Task 节点 config（轻量化，只存引用）
 */
export function parseAgentTaskConfig(rawConfig = {}) {
    const history = Array.isArray(rawConfig.task_history) ? rawConfig.task_history.slice(-MAX_TASK_HISTORY) : [];
    return {
        agent_profile_id: rawConfig.agent_profile_id || null,
        skill_id: rawConfig.skill_id || null,
        instruction: rawConfig.instruction || '',
        active_task_id: rawConfig.active_task_id || null,
        latest_successful_task_id: rawConfig.latest_successful_task_id || null,
        session_id: rawConfig.session_id || null,
        result_summary: rawConfig.result_summary || null,
        task_history: history
    };
}

/**
 * 校验 config 格式
 */
export function validateAgentTaskConfig(config) {
    const parsed = parseAgentTaskConfig(config);
    const errors = [];
    if (!parsed.agent_profile_id) {
        errors.push('agent_profile_id is required');
    }
    if (!parsed.instruction || !parsed.instruction.trim()) {
        errors.push('instruction is required');
    }
    return {
        valid: errors.length === 0,
        errors,
        config: parsed
    };
}

/**
 * 判断节点是否具备提交条件
 */
export function canSubmitTask(config) {
    const { valid } = validateAgentTaskConfig(config);
    return valid;
}

/**
 * 切换 Agent 时清除不兼容的 skill 和旧 session
 */
export function clearSkillOnAgentChange(config, newAgentProfileId) {
    const current = parseAgentTaskConfig(config);
    if (current.agent_profile_id === newAgentProfileId) {
        return current;
    }
    return {
        ...current,
        agent_profile_id: newAgentProfileId,
        skill_id: null,
        session_id: null,
        active_task_id: null
    };
}

/**
 * 从入边与上游节点推导 contextRefs
 */
export function deriveContextFromInputs(inboundEdges = [], nodeMap = new Map()) {
    const contextRefs = [];
    for (const edge of inboundEdges) {
        const sourceId = edge.source || edge.from;
        if (!sourceId) continue;
        const sourceNode = nodeMap.get(sourceId);
        if (!sourceNode) continue;

        if (sourceNode.type === 'smart-asset' || sourceNode.asset_version_id || sourceNode.asset_id) {
            contextRefs.push({
                type: 'asset_version',
                id: sourceNode.asset_version_id || sourceNode.asset_id || sourceId,
                title: sourceNode.title || 'Upstream Asset'
            });
        } else if (sourceNode.type === 'prompt-node' || sourceNode.prompt) {
            contextRefs.push({
                type: 'text_node',
                id: sourceId,
                title: sourceNode.title || 'Prompt Input',
                content: sourceNode.prompt || sourceNode.content || ''
            });
        } else {
            contextRefs.push({
                type: 'node_ref',
                id: sourceId,
                title: sourceNode.title || sourceNode.type || 'Upstream Node'
            });
        }
    }
    return contextRefs;
}

/**
 * 构造提交 Task Payload
 */
export function createAgentTaskPayload(config, contextRefs = []) {
    const parsed = parseAgentTaskConfig(config);
    if (!parsed.agent_profile_id) {
        throw new Error('Cannot create Task payload without agent_profile_id');
    }
    return {
        agent_profile_id: parsed.agent_profile_id,
        skill_id: parsed.skill_id || undefined,
        session_id: parsed.session_id || undefined,
        instruction: parsed.instruction.trim(),
        context_refs: contextRefs
    };
}

/**
 * 终态 Patch 节点 config（有界 task_history，保留旧 ID）
 */
export function patchConfigWithTaskResult(config, task) {
    const parsed = parseAgentTaskConfig(config);
    const newHistory = [...parsed.task_history];

    if (task.id && !newHistory.includes(task.id)) {
        newHistory.push(task.id);
        if (newHistory.length > MAX_TASK_HISTORY) {
            newHistory.shift();
        }
    }

    const isSuccess = task.status === 'succeeded';
    const summary = task.result
        ? (typeof task.result === 'object' ? JSON.stringify(task.result).substring(0, 120) : String(task.result).substring(0, 120))
        : parsed.result_summary;

    return {
        ...parsed,
        active_task_id: task.id || parsed.active_task_id,
        session_id: task.session_id || parsed.session_id,
        latest_successful_task_id: isSuccess ? task.id : parsed.latest_successful_task_id,
        result_summary: summary,
        task_history: newHistory
    };
}

/**
 * DOM 渲染器
 */
export function renderAgentTaskNode(node) {
    if (typeof document === 'undefined') return null;

    const div = document.createElement('div');
    div.className = 'smart-node agent-task-node';
    div.id = `node-${node.id}`;

    const config = parseAgentTaskConfig(node.config || {});
    const nodeStatus = globalNodeStatusBus.getStatus(node.id) || 'idle';

    div.innerHTML = `
        <div class="smart-node-head">
            <div class="head-title">
                <span class="icon">🤖</span>
                <span class="smart-node-title">${node.title || 'Agent Task'}</span>
            </div>
            <span class="agent-task-chip status-${nodeStatus}">${nodeStatus.toUpperCase()}</span>
        </div>
        <div class="smart-node-body">
            <div class="form-group">
                <label>指令概要:</label>
                <div class="agent-task-instruction-text">${config.instruction || '(未设置指令)'}</div>
            </div>
            ${config.result_summary ? `
                <div class="agent-task-summary">
                    <label>输出摘要:</label>
                    <p>${config.result_summary}</p>
                </div>
            ` : ''}
            <div class="agent-task-node-actions">
                <button class="btn btn-sm btn-primary agent-task-run-btn" ${!canSubmitTask(config) ? 'disabled' : ''}>执行</button>
                <button class="btn btn-sm btn-secondary agent-task-view-btn" ${!config.active_task_id ? 'disabled' : ''}>查看结果</button>
            </div>
        </div>
    `;

    // 绑定按钮事件
    const runBtn = div.querySelector('.agent-task-run-btn');
    if (runBtn) {
        nodeFactory.addEventListenerWithCleanup(node.id, runBtn, 'click', (e) => {
            e.stopPropagation();
            if (typeof window !== 'undefined' && window.openAgentDock) {
                window.openAgentDock({
                    agentProfileId: config.agent_profile_id,
                    skillId: config.skill_id,
                    instruction: config.instruction,
                    sessionId: config.session_id,
                    activeTaskId: config.active_task_id
                });
            }
        });
    }

    const viewBtn = div.querySelector('.agent-task-view-btn');
    if (viewBtn) {
        nodeFactory.addEventListenerWithCleanup(node.id, viewBtn, 'click', (e) => {
            e.stopPropagation();
            if (typeof window !== 'undefined' && window.openAgentDock) {
                window.openAgentDock({
                    agentProfileId: config.agent_profile_id,
                    sessionId: config.session_id,
                    activeTaskId: config.active_task_id
                });
            }
        });
    }

    return div;
}

// 注册渲染器到全局 NodeFactory
nodeFactory.registerRenderer(AGENT_TASK_NODE_TYPE, renderAgentTaskNode);
