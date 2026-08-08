/**
 * Agent Center - Agents 视图 (Native ESM Architecture)
 * 职责：负责 Agent Profile 列表渲染、创建/编辑/测试/删除交互。
 * 遵循 <= 900 行规范 (SRP 模块化)
 */

import { AgentToast, AgentConfirm } from './ui-feedback.js?v=2026.08.07.999';

export class AgentsView {
    constructor(options = {}) {
        this.apiClient = options.apiClient;
        this.onRefresh = options.onRefresh || (() => {});
    }

    render(agents = []) {
        this.agents = agents;
        if (agents.length === 0) {
            return `
                <div class="empty-state-card">
                    <div class="empty-title">尚未创建 Agent 智能体</div>
                    <div class="empty-desc">绑定 Runtime 并配置系统指令/技能以构建专属于你的 Agent。</div>
                    <button type="button" class="btn-primary" id="btn-create-agent">
                        <i data-lucide="plus"></i> 创建 Agent
                    </button>
                </div>
            `;
        }

        const items = agents.map(agt => `
            <div class="agent-card" data-id="${agt.id}">
                <div class="card-header">
                    <span class="card-name">
                        <i data-lucide="bot"></i> ${this._escapeHtml(agt.name)}
                    </span>
                    <span class="card-slug">@${this._escapeHtml(agt.slug)}</span>
                </div>
                <div class="card-details">
                    <div><strong>Runtime:</strong> <code>${this._escapeHtml(agt.runtime_profile_id || '默认')}</code></div>
                    <div><strong>版本修订:</strong> Revision ${agt.current_revision || 1}</div>
                    <div><strong>描述:</strong> ${this._escapeHtml(agt.description || '暂无描述')}</div>
                </div>
                <div class="card-actions">
                    <button type="button" class="btn-sm btn-secondary" data-action="test-agent" data-id="${agt.id}">
                        <i data-lucide="play"></i> 测试运行
                    </button>
                    <button type="button" class="btn-sm btn-secondary" data-action="duplicate-agent" data-id="${agt.id}">
                        <i data-lucide="copy"></i> 复制
                    </button>
                    <button type="button" class="btn-sm btn-danger" data-action="delete-agent" data-id="${agt.id}">
                        <i data-lucide="trash-2"></i> 删除
                    </button>
                </div>
            </div>
        `).join('');

        return `
            <div class="tab-toolbar">
                <button type="button" class="btn-primary" id="btn-create-agent">
                    <i data-lucide="plus"></i> 创建 Agent
                </button>
            </div>
            <div class="cards-grid">${items}</div>
        `;
    }

    bindEvents(container, runtimes = []) {
        if (!container) return;

        if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({
                attrs: {
                    class: ['lucide-icon']
                }
            });
        }

        const createBtn = container.querySelector('#btn-create-agent');
        if (createBtn) {
            createBtn.onclick = () => this._showCreateModal(runtimes);
        }

        container.querySelectorAll('[data-action="test-agent"]').forEach(btn => {
            btn.onclick = () => {
                const id = btn.getAttribute('data-id');
                const agt = (this.agents || []).find(a => a.id === id) || { id, name: id, runtime_profile_id: '默认' };
                this._showTestModal(agt);
            };
        });

        container.querySelectorAll('[data-action="duplicate-agent"]').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.getAttribute('data-id');
                try {
                    await this.apiClient.agents.duplicateProfile(id);
                    AgentToast.success('Agent 已复制');
                    await this.onRefresh();
                } catch (e) {
                    AgentToast.error(`复制失败: ${e.message}`);
                }
            };
        });

        container.querySelectorAll('[data-action="delete-agent"]').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.getAttribute('data-id');
                await AgentConfirm.show({
                    title: '删除 Agent',
                    message: `确定要删除 Agent (${id}) 吗？`,
                    confirmText: '删除',
                    danger: true,
                    onConfirm: async () => {
                        await this.apiClient.agents.deleteProfile(id);
                        AgentToast.success('Agent 已删除');
                        await this.onRefresh();
                    }
                });
            };
        });
    }

    _showCreateModal(runtimes = []) {
        const runtimeOptions = runtimes.map(r => `<option value="${r.id}">${this._escapeHtml(r.name)} (${r.adapter_type})</option>`).join('');

        const modalHtml = `
            <div class="agent-modal-overlay" id="agent-modal-overlay">
                <div class="agent-modal">
                    <div class="modal-header">
                        <div class="modal-title">创建 Agent</div>
                        <button type="button" class="modal-close" id="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Agent 名称</label>
                            <input type="text" id="agt-name" placeholder="例如: 剧本大师 / 代码审计员" value="Storyteller Agent">
                        </div>
                        <div class="form-group">
                            <label>Agent Slug (唯一标识)</label>
                            <input type="text" id="agt-slug" placeholder="storyteller" value="storyteller_${Date.now().toString().slice(-4)}">
                        </div>
                        <div class="form-group">
                            <label>绑定 Runtime</label>
                            <select id="agt-runtime">
                                ${runtimeOptions || '<option value="">未找到已注册 Runtime</option>'}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>系统 Prompt 指令 (Instructions)</label>
                            <textarea id="agt-instructions" rows="4" placeholder="例如: 你是一位专业资深编剧，回答需具备戏剧张力与电影视效感知。">你是一位富有创意的 AI 助手，擅长图像生成 Prompt 拆解与剧本构思。</textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn-secondary" id="modal-cancel-btn">取消</button>
                        <button type="button" class="btn-primary" id="modal-submit-btn">创建 Agent</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const overlay = document.getElementById('agent-modal-overlay');

        const close = () => overlay.remove();
        overlay.querySelector('#modal-close-btn').onclick = close;
        overlay.querySelector('#modal-cancel-btn').onclick = close;

        overlay.querySelector('#modal-submit-btn').onclick = async () => {
            const name = overlay.querySelector('#agt-name').value.trim();
            const slug = overlay.querySelector('#agt-slug').value.trim();
            const runtime_profile_id = overlay.querySelector('#agt-runtime').value;
            const instructions = overlay.querySelector('#agt-instructions').value.trim();

            if (!name || !slug) return AgentToast.error('请填写入参 Name 与 Slug');
            if (!runtime_profile_id) return AgentToast.error('需要先关联一个 Runtime 执行环境');

            try {
                await this.apiClient.agents.createProfile({
                    name,
                    slug,
                    runtime_profile_id,
                    instructions
                });
                AgentToast.success(`Agent "${name}" 创建成功`);
                close();
                await this.onRefresh();
            } catch (e) {
                AgentToast.error(`创建 Agent 失败: ${e.message}`);
            }
        };
    }

    _showTestModal(agt) {
        const modalHtml = `
            <div class="agent-modal-overlay" id="test-agent-modal-overlay">
                <div class="agent-modal" style="width: 620px;">
                    <div class="modal-header">
                        <div class="modal-title" style="display:flex;align-items:center;gap:8px;">
                            <i data-lucide="bot"></i> 测试运行 Agent: ${this._escapeHtml(agt.name)}
                        </div>
                        <button type="button" class="modal-close" id="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div style="font-size: 12px; color: var(--text-muted); display:flex; gap:16px;">
                            <span><strong>Runtime ID:</strong> <code>${this._escapeHtml(agt.runtime_profile_id || '默认')}</code></span>
                            <span><strong>标识:</strong> @${this._escapeHtml(agt.slug)}</span>
                        </div>
                        <div class="form-group">
                            <label>测试 Prompt 消息 (Test Message)</label>
                            <textarea id="test-msg-input" rows="3" placeholder="输入测试消息...">你好，请简短自我介绍并确认你的运行状态。</textarea>
                        </div>
                        <div class="form-group">
                            <label>执行输出与运行日志 (Execution Console)</label>
                            <div class="test-output-console" id="test-console-output">点击“开始测试运行”以调起此 Agent 及底层 Runtime...</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn-secondary" id="modal-cancel-btn">关闭</button>
                        <button type="button" class="btn-primary" id="btn-start-test">
                            <i data-lucide="play"></i> 开始测试运行
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const overlay = document.getElementById('test-agent-modal-overlay');
        const consoleBox = overlay.querySelector('#test-console-output');
        const submitBtn = overlay.querySelector('#btn-start-test');

        if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ attrs: { class: ['lucide-icon'] } });
        }

        const close = () => overlay.remove();
        overlay.querySelector('#modal-close-btn').onclick = close;
        overlay.querySelector('#modal-cancel-btn').onclick = close;

        submitBtn.onclick = async () => {
            const message = overlay.querySelector('#test-msg-input').value.trim();
            if (!message) return AgentToast.error('请输入测试消息');

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i data-lucide="loader" class="spin-icon"></i> 正在调用 Runtime 运行中...';
            if (window.lucide) window.lucide.createIcons();

            consoleBox.style.color = '#38bdf8';
            consoleBox.textContent = `[${new Date().toLocaleTimeString()}] 🚀 正在创建测试 Task 任务...\n[${new Date().toLocaleTimeString()}] ⏳ 唤醒 Runtime (${agt.runtime_profile_id || '默认'})，等待 AI 回复中...`;

            try {
                const res = await this.apiClient.agents.testProfile(agt.id, { message });
                if (res.ok) {
                    const outputStr = res.message || (res.task?.latest_run?.result_summary) || '任务完成，无更多输出';
                    consoleBox.style.color = '#4ade80';
                    consoleBox.textContent = `[${new Date().toLocaleTimeString()}] ✅ 运行成功！\n[Task ID]: ${res.task?.id || 'tsk_test'}\n\n🤖 [Agent 回复内容]:\n${outputStr}`;
                    AgentToast.success(`Agent 测试成功！`);
                } else {
                    const errStr = res.message || res.task?.error?.message || '未知测试故障';
                    consoleBox.style.color = '#f87171';
                    consoleBox.textContent = `[${new Date().toLocaleTimeString()}] ❌ 运行失败\n[Task ID]: ${res.task?.id || 'tsk_test'}\n\n[报错原因]:\n${errStr}`;
                    AgentToast.error(`测试未通过: ${errStr}`);
                }
            } catch (e) {
                consoleBox.style.color = '#f87171';
                consoleBox.textContent = `[${new Date().toLocaleTimeString()}] ❌ 请求异常: ${e.message}`;
                AgentToast.error(`测试请求失败: ${e.message}`);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i data-lucide="play"></i> 重新测试运行';
                if (window.lucide) window.lucide.createIcons();
            }
        };
    }

    _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
