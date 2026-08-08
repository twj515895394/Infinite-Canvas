/**
 * Agent Center - Tasks 视图 (Native ESM Architecture)
 * 职责：负责 Agent 任务列表、状态筛选、取消与重试交互。
 * 遵循 <= 900 行规范 (SRP 模块化)
 */

import { AgentToast, AgentConfirm } from './ui-feedback.js?v=2026.08.07.999';

export class TasksView {
    constructor(options = {}) {
        this.apiClient = options.apiClient;
        this.onRefresh = options.onRefresh || (() => {});
        this.onFilterChange = options.onFilterChange || (() => {});
    }

    render(tasks = [], activeFilter = 'all') {
        if (tasks.length === 0) {
            return `
                <div class="tab-toolbar">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600;">
                        <i data-lucide="filter" style="width: 14px; height: 14px;"></i> 状态筛选:
                        <select id="task-status-filter" class="form-control">
                            <option value="all" ${activeFilter === 'all' ? 'selected' : ''}>全部状态</option>
                            <option value="queued" ${activeFilter === 'queued' ? 'selected' : ''}>排队中 (Queued)</option>
                            <option value="running" ${activeFilter === 'running' ? 'selected' : ''}>运行中 (Running)</option>
                            <option value="completed" ${activeFilter === 'completed' ? 'selected' : ''}>已完成 (Completed)</option>
                            <option value="failed" ${activeFilter === 'failed' ? 'selected' : ''}>已失败 (Failed)</option>
                        </select>
                    </label>
                </div>
                <div class="empty-state-card">
                    <div class="empty-title">暂无 Task 任务记录</div>
                    <div class="empty-desc">在 Smart Canvas 画布中添加 Agent Task 节点或通过 API 发起任务以生成记录。</div>
                </div>
            `;
        }

        const items = tasks.map(tsk => `
            <div class="task-row" data-id="${tsk.id}">
                <div class="task-info">
                    <span class="task-id">${tsk.id}</span>
                    <span class="status-chip chip-${tsk.status}">${tsk.status}</span>
                    <span class="task-instruction" title="${this._escapeHtml(tsk.instruction || '')}">
                        ${this._escapeHtml(tsk.instruction || '无指令入参')}
                    </span>
                </div>
                <div class="task-actions">
                    ${tsk.status === 'running' || tsk.status === 'queued' ? `
                        <button type="button" class="btn-sm btn-danger" data-action="cancel-task" data-id="${tsk.id}">
                            <i data-lucide="x-circle"></i> 取消
                        </button>
                    ` : ''}
                    ${tsk.status === 'failed' || tsk.status === 'cancelled' ? `
                        <button type="button" class="btn-sm btn-secondary" data-action="retry-task" data-id="${tsk.id}">
                            <i data-lucide="rotate-cw"></i> 重视
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');

        return `
            <div class="tab-toolbar">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600;">
                    <i data-lucide="filter" style="width: 14px; height: 14px;"></i> 状态筛选:
                    <select id="task-status-filter">
                        <option value="all" ${activeFilter === 'all' ? 'selected' : ''}>全部状态</option>
                        <option value="queued" ${activeFilter === 'queued' ? 'selected' : ''}>排队中 (Queued)</option>
                        <option value="running" ${activeFilter === 'running' ? 'selected' : ''}>运行中 (Running)</option>
                        <option value="completed" ${activeFilter === 'completed' ? 'selected' : ''}>已完成 (Completed)</option>
                        <option value="failed" ${activeFilter === 'failed' ? 'selected' : ''}>已失败 (Failed)</option>
                    </select>
                </label>
            </div>
            <div class="tasks-list">${items}</div>
        `;
    }

    bindEvents(container) {
        if (!container) return;

        if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({
                attrs: {
                    class: ['lucide-icon']
                }
            });
        }

        const filterSelect = container.querySelector('#task-status-filter');
        if (filterSelect) {
            filterSelect.onchange = async () => {
                await this.onFilterChange(filterSelect.value);
            };
        }

        container.querySelectorAll('[data-action="cancel-task"]').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.getAttribute('data-id');
                btn.disabled = true;
                try {
                    await this.apiClient.agents.cancelTask(id);
                    AgentToast.info(`任务 ${id} 已取消`);
                    await this.onRefresh();
                } catch (e) {
                    AgentToast.error(`取消任务失败: ${e.message}`);
                } finally {
                    btn.disabled = false;
                }
            };
        });

        container.querySelectorAll('[data-action="retry-task"]').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.getAttribute('data-id');
                btn.disabled = true;
                try {
                    await this.apiClient.agents.retryTask(id);
                    AgentToast.success(`任务 ${id} 已重试提交`);
                    await this.onRefresh();
                } catch (e) {
                    AgentToast.error(`重试任务失败: ${e.message}`);
                } finally {
                    btn.disabled = false;
                }
            };
        });
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
