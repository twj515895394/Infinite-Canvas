/**
 * Legacy Frontend Agent Dock 浮层控制器 (Native ESM)
 * 封装全局 Agent Dock 交互：选 Agent/Skill、指令输入、关联上下文/素材、任务提交、事件轮询、取消及结果导出/入库。
 */

import { v2ApiClient } from './v2-api-client.js';

export class AgentDockController {
    constructor(options = {}) {
        this.apiClient = options.apiClient || v2ApiClient;
        this.containerEl = options.containerEl || null;
        this.isOpen = false;
        
        // Active state
        this.profiles = [];
        this.skills = [];
        this.selectedAgentId = null;
        this.selectedSkillId = null;
        this.sessionId = null;
        this.activeTaskId = null;
        this.activeTask = null;
        this.contextRefs = [];
        this.events = [];
        this.pollTimer = null;
        this.isSubmitting = false;

        // Callback hooks
        this.onTaskStateChange = options.onTaskStateChange || null;
    }

    /**
     * 重置状态（例如切换 Agent 时清理脏 Task/Session 状态）
     */
    resetTaskState() {
        this.stopPolling();
        this.activeTaskId = null;
        this.activeTask = null;
        this.events = [];
        this.isSubmitting = false;
    }

    /**
     * 打开 Dock 浮层并可传入初始上下文
     */
    async openDock(options = {}) {
        const {
            agentProfileId = null,
            skillId = null,
            contextRefs = [],
            activeTaskId = null,
            sessionId = null,
            instruction = ''
        } = options;

        this.isOpen = true;
        this.contextRefs = Array.isArray(contextRefs) ? [...contextRefs] : [];
        if (sessionId) this.sessionId = sessionId;
        
        await this.loadAgentsAndSkills();

        if (agentProfileId && this.profiles.some(p => p.id === agentProfileId)) {
            if (this.selectedAgentId !== agentProfileId) {
                this.selectedAgentId = agentProfileId;
                this.selectedSkillId = skillId;
                this.resetTaskState();
            }
        } else if (!this.selectedAgentId && this.profiles.length > 0) {
            this.selectedAgentId = this.profiles[0].id;
        }

        if (skillId && this.skills.some(s => s.id === skillId)) {
            this.selectedSkillId = skillId;
        }

        if (activeTaskId) {
            this.activeTaskId = activeTaskId;
            await this.fetchTaskDetails(activeTaskId);
            this.startPolling(activeTaskId);
        }

        this.render();

        if (instruction && this.containerEl) {
            const input = this.containerEl.querySelector('.agent-dock-instruction');
            if (input) input.value = instruction;
        }
    }

    closeDock() {
        this.isOpen = false;
        this.stopPolling();
        if (this.containerEl) {
            this.containerEl.classList.remove('agent-dock-visible');
        }
    }

    async loadAgentsAndSkills() {
        try {
            const [profilesResp, skillsResp] = await Promise.all([
                this.apiClient.agents.listProfiles({ status: 'active' }).catch(() => ({ items: [] })),
                this.apiClient.agents.listSkills({ status: 'active' }).catch(() => ({ items: [] }))
            ]);
            this.profiles = profilesResp.items || profilesResp.data || [];
            this.skills = skillsResp.items || skillsResp.data || [];
        } catch (err) {
            console.warn('[AgentDock] 加载 Agent/Skill 失败:', err);
            this.profiles = [];
            this.skills = [];
        }
    }

    /**
     * 切换 Agent，重置脏 skill 和 task
     */
    setAgent(agentId) {
        if (this.selectedAgentId === agentId) return;
        this.selectedAgentId = agentId;
        this.selectedSkillId = null;
        this.sessionId = null;
        this.resetTaskState();
        this.render();
    }

    setSkill(skillId) {
        this.selectedSkillId = skillId || null;
        this.render();
    }

    /**
     * 提交任务
     */
    async submitTask(instruction, opts = {}) {
        if (!this.selectedAgentId) {
            throw new Error('未选择 Agent 引擎');
        }
        if (!instruction || !instruction.trim()) {
            throw new Error('请输入任务指令');
        }

        this.isSubmitting = true;
        this.render();

        try {
            // 1. 创建或保留 Session
            if (!this.sessionId) {
                const session = await this.apiClient.agents.createSession({
                    agent_profile_id: this.selectedAgentId,
                    title: `Session ${new Date().toLocaleTimeString()}`
                });
                this.sessionId = session.id;
            }

            // 2. 构造 Context Refs
            const finalContextRefs = [...this.contextRefs, ...(opts.contextRefs || [])];

            // 3. 提交 Task
            const payload = {
                session_id: this.sessionId,
                agent_profile_id: this.selectedAgentId,
                skill_id: this.selectedSkillId || undefined,
                instruction: instruction.trim(),
                context_refs: finalContextRefs
            };

            const task = await this.apiClient.agents.createTask(payload);
            this.activeTaskId = task.id;
            this.activeTask = task;
            this.isSubmitting = false;

            if (this.onTaskStateChange) {
                this.onTaskStateChange(task);
            }

            this.startPolling(task.id);
            this.render();
            return task;
        } catch (err) {
            this.isSubmitting = false;
            this.render();
            throw err;
        }
    }

    /**
     * 取消任务
     */
    async cancelActiveTask() {
        if (!this.activeTaskId) return;
        try {
            // UI 立即反映取消中
            if (this.activeTask) {
                this.activeTask.status = 'canceling';
            }
            this.render();

            const task = await this.apiClient.agents.cancelTask(this.activeTaskId);
            this.activeTask = task;
            if (this.onTaskStateChange) {
                this.onTaskStateChange(task);
            }
            this.render();
        } catch (err) {
            console.error('[AgentDock] 取消任务失败:', err);
        }
    }

    /**
     * 轮询 Task 与 Event Stream
     */
    startPolling(taskId) {
        this.stopPolling();
        const poll = async () => {
            if (!this.activeTaskId || this.activeTaskId !== taskId) {
                this.stopPolling();
                return;
            }
            await this.fetchTaskDetails(taskId);
            
            const status = this.activeTask ? this.activeTask.status : null;
            if (['succeeded', 'failed', 'cancelled'].includes(status)) {
                this.stopPolling();
            }
        };
        poll();
        this.pollTimer = setInterval(poll, 1500);
    }

    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    async fetchTaskDetails(taskId) {
        try {
            const [task, eventsResp] = await Promise.all([
                this.apiClient.agents.getTask(taskId),
                this.apiClient.agents.getTaskEvents(taskId).catch(() => ({ items: [] }))
            ]);
            this.activeTask = task;
            this.events = eventsResp.items || eventsResp.data || [];
            if (this.onTaskStateChange) {
                this.onTaskStateChange(task);
            }
            this.render();
        } catch (err) {
            console.warn('[AgentDock] 获取 Task 详情失败:', err);
        }
    }

    /**
     * 导出结果：本地 JSON/Text 下载
     */
    downloadResult() {
        if (!this.activeTask || !this.activeTask.result) return;
        const content = typeof this.activeTask.result === 'object' 
            ? JSON.stringify(this.activeTask.result, null, 2)
            : String(this.activeTask.result);
        
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agent-task-${this.activeTask.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * 结果入库 Asset
     */
    async saveResultToAssets() {
        if (!this.activeTask || !this.activeTask.result) return;
        const textContent = typeof this.activeTask.result === 'object'
            ? JSON.stringify(this.activeTask.result, null, 2)
            : String(this.activeTask.result);
        
        const blob = new Blob([textContent], { type: 'text/plain' });
        const formData = new FormData();
        formData.append('file', blob, `agent-result-${this.activeTask.id.substring(0, 8)}.txt`);
        formData.append('title', `Agent Task Result: ${this.activeTask.instruction || 'Output'}`);
        formData.append('asset_type', 'text');
        
        try {
            const result = await this.apiClient.assets.ingestAsset(formData);
            alert(`已成功保存至素材库 (Asset ID: ${result.id || 'ok'})`);
            return result;
        } catch (err) {
            alert(`保存素材失败: ${err.message}`);
            throw err;
        }
    }

    /**
     * 渲染 DOM
     */
    render() {
        if (typeof document === 'undefined') return;

        if (!this.containerEl) {
            let el = document.getElementById('agent-dock-overlay');
            if (!el) {
                el = document.createElement('div');
                el.id = 'agent-dock-overlay';
                el.className = 'agent-dock-overlay';
                document.body.appendChild(el);
            }
            this.containerEl = el;
        }

        if (!this.isOpen) {
            this.containerEl.classList.remove('agent-dock-visible');
            return;
        }

        this.containerEl.classList.add('agent-dock-visible');

        const noAgents = this.profiles.length === 0;

        let statusBadge = '';
        if (this.activeTask) {
            const status = this.activeTask.status || 'pending';
            statusBadge = `<span class="agent-dock-status-badge status-${status}">${status.toUpperCase()}</span>`;
        }

        let eventsHtml = '';
        if (this.events.length > 0) {
            eventsHtml = this.events.map(ev => `
                <div class="agent-dock-event-item">
                    <span class="event-time">${new Date(ev.created_at || Date.now()).toLocaleTimeString()}</span>
                    <span class="event-type">[${ev.event_type || 'info'}]</span>
                    <span class="event-msg">${ev.message || JSON.stringify(ev.payload || {})}</span>
                </div>
            `).join('');
        } else if (this.activeTask && this.activeTask.result) {
            eventsHtml = `<div class="agent-dock-result-box"><pre>${typeof this.activeTask.result === 'object' ? JSON.stringify(this.activeTask.result, null, 2) : this.activeTask.result}</pre></div>`;
        }

        let contextHtml = '';
        if (this.contextRefs.length > 0) {
            contextHtml = `
                <div class="agent-dock-context-tags">
                    <span class="context-label">上下文关联:</span>
                    ${this.contextRefs.map(c => `<span class="context-tag">${c.type || 'ref'}: ${c.id || c.title || 'asset'}</span>`).join('')}
                </div>
            `;
        }

        this.containerEl.innerHTML = `
            <div class="agent-dock-panel">
                <div class="agent-dock-header">
                    <div class="header-title">
                        <span class="icon">🤖</span>
                        <h3>Agent Dock 执行中心</h3>
                        ${statusBadge}
                    </div>
                    <button class="agent-dock-close-btn" id="agent-dock-close">&times;</button>
                </div>

                <div class="agent-dock-body">
                    ${noAgents ? `
                        <div class="agent-dock-empty-guide">
                            <p>⚠️ 未探测到可用的 Agent Profile。</p>
                            <p>请前往 <strong>Agent Center</strong> 配置并激活 Agent 后使用。</p>
                            <button class="btn btn-primary" id="agent-dock-goto-center">前往 Agent Center</button>
                        </div>
                    ` : `
                        <div class="agent-dock-controls">
                            <div class="form-group">
                                <label>选择 Agent Profile:</label>
                                <select class="agent-dock-select-agent" id="agent-dock-agent-select">
                                    ${this.profiles.map(p => `
                                        <option value="${p.id}" ${p.id === this.selectedAgentId ? 'selected' : ''}>
                                            ${p.name} (${p.model || 'Default'})
                                        </option>
                                    `).join('')}
                                </select>
                            </div>

                            <div class="form-group">
                                <label>选择 Skill (可选):</label>
                                <select class="agent-dock-select-skill" id="agent-dock-skill-select">
                                    <option value="">-- 无特定 Skill --</option>
                                    ${this.skills.map(s => `
                                        <option value="${s.id}" ${s.id === this.selectedSkillId ? 'selected' : ''}>
                                            ${s.name} (v${s.version || '1.0'})
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>

                        ${contextHtml}

                        <div class="form-group">
                            <label>任务指令 (Instruction):</label>
                            <textarea class="agent-dock-instruction" id="agent-dock-instruction-input" placeholder="请输入向 Agent 提问或执行任务的指令..." ${this.isSubmitting || (this.activeTask && ['running', 'pending', 'queued'].includes(this.activeTask.status)) ? 'disabled' : ''}></textarea>
                        </div>

                        <div class="agent-dock-actions">
                            ${this.activeTask && ['running', 'pending', 'queued'].includes(this.activeTask.status) ? `
                                <button class="btn btn-danger" id="agent-dock-cancel-btn">取消任务</button>
                            ` : `
                                <button class="btn btn-primary" id="agent-dock-submit-btn" ${this.isSubmitting ? 'disabled' : ''}>
                                    ${this.isSubmitting ? '提交中...' : '启动 Agent 任务'}
                                </button>
                            `}

                            ${this.activeTask && this.activeTask.result ? `
                                <button class="btn btn-secondary" id="agent-dock-download-btn">下载结果</button>
                                <button class="btn btn-secondary" id="agent-dock-save-asset-btn">保存至素材库</button>
                            ` : ''}
                        </div>

                        ${eventsHtml ? `
                            <div class="agent-dock-feed-container">
                                <h4>执行事件与结果</h4>
                                <div class="agent-dock-event-stream">${eventsHtml}</div>
                            </div>
                        ` : ''}
                    `}
                </div>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        if (!this.containerEl) return;

        const closeBtn = this.containerEl.querySelector('#agent-dock-close');
        if (closeBtn) closeBtn.onclick = () => this.closeDock();

        const agentSelect = this.containerEl.querySelector('#agent-dock-agent-select');
        if (agentSelect) {
            agentSelect.onchange = (e) => this.setAgent(e.target.value);
        }

        const skillSelect = this.containerEl.querySelector('#agent-dock-skill-select');
        if (skillSelect) {
            skillSelect.onchange = (e) => this.setSkill(e.target.value);
        }

        const gotoCenterBtn = this.containerEl.querySelector('#agent-dock-goto-center');
        if (gotoCenterBtn) {
            gotoCenterBtn.onclick = () => {
                this.closeDock();
                if (typeof window !== 'undefined' && window.openAgentCenter) {
                    window.openAgentCenter();
                } else if (typeof window !== 'undefined') {
                    window.location.hash = '#agent-center';
                }
            };
        }

        const submitBtn = this.containerEl.querySelector('#agent-dock-submit-btn');
        if (submitBtn) {
            submitBtn.onclick = async () => {
                const input = this.containerEl.querySelector('#agent-dock-instruction-input');
                const text = input ? input.value : '';
                try {
                    await this.submitTask(text);
                } catch (err) {
                    alert(`提交失败: ${err.message}`);
                }
            };
        }

        const cancelBtn = this.containerEl.querySelector('#agent-dock-cancel-btn');
        if (cancelBtn) {
            cancelBtn.onclick = () => this.cancelActiveTask();
        }

        const downloadBtn = this.containerEl.querySelector('#agent-dock-download-btn');
        if (downloadBtn) {
            downloadBtn.onclick = () => this.downloadResult();
        }

        const saveAssetBtn = this.containerEl.querySelector('#agent-dock-save-asset-btn');
        if (saveAssetBtn) {
            saveAssetBtn.onclick = () => this.saveResultToAssets();
        }
    }
}

export const agentDockController = new AgentDockController();

export function openAgentDock(options = {}) {
    return agentDockController.openDock(options);
}

if (typeof window !== 'undefined') {
    window.agentDockController = agentDockController;
    window.openAgentDock = openAgentDock;
}
