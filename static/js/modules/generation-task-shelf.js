/**
 * Legacy Frontend Generation Task Shelf 控制器 (Native ESM)
 * 对接 /api/v2/generation-tasks：列表展示、状态轮询、取消/重试及关联画布节点定位跳转。
 */

import { v2ApiClient } from './v2-api-client.js';

export class GenerationTaskShelfController {
    constructor(options = {}) {
        this.apiClient = options.apiClient || v2ApiClient;
        this.containerEl = options.containerEl || null;
        this.isOpen = false;
        
        this.tasks = [];
        this.statusFilter = 'all';
        this.pollTimer = null;
        this.pollIntervalMs = options.pollIntervalMs || 2000;
        this.onJumpToNode = options.onJumpToNode || null;
    }

    /**
     * 打开 Task Shelf 抽屉
     */
    async openShelf(filter = 'all') {
        this.isOpen = true;
        this.statusFilter = filter;
        await this.loadTasks();
        this.startPolling();
        this.render();
    }

    closeShelf() {
        this.isOpen = false;
        this.stopPolling();
        if (this.containerEl) {
            this.containerEl.classList.remove('generation-shelf-visible');
        }
    }

    /**
     * 加载 Generation Tasks
     */
    async loadTasks() {
        try {
            const query = {};
            if (this.statusFilter && this.statusFilter !== 'all') {
                query.status = this.statusFilter;
            }
            const resp = await this.apiClient.tasks.listGenerationTasks(query);
            this.tasks = resp.items || resp.data || [];
        } catch (err) {
            console.warn('[GenerationTaskShelf] 加载生成任务列表失败:', err);
            this.tasks = [];
        }
    }

    /**
     * 轮询活跃任务
     */
    startPolling() {
        this.stopPolling();
        this.pollTimer = setInterval(async () => {
            if (!this.isOpen) {
                this.stopPolling();
                return;
            }
            await this.loadTasks();
            this.render();

            const hasActiveTasks = this.tasks.some(t => ['queued', 'running', 'pending'].includes(t.status));
            if (!hasActiveTasks) {
                // 如果没有活跃任务，可适度降低频率，但在此维持基础轮询
            }
        }, this.pollIntervalMs);
    }

    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /**
     * 取消指定生成任务
     */
    async cancelTask(taskId) {
        if (!taskId) return;
        try {
            const task = this.tasks.find(t => t.id === taskId);
            if (task) task.status = 'canceling';
            this.render();

            await this.apiClient.tasks.cancelGenerationTask(taskId);
            await this.loadTasks();
            this.render();
        } catch (err) {
            alert(`取消失败: ${err.message}`);
        }
    }

    /**
     * 重试指定生成任务
     */
    async retryTask(taskId) {
        if (!taskId) return;
        try {
            await this.apiClient.tasks.retryGenerationTask(taskId);
            await this.loadTasks();
            this.render();
        } catch (err) {
            alert(`重试失败: ${err.message}`);
        }
    }

    /**
     * 定位跳转到关联节点
     */
    jumpToNode(nodeId) {
        if (!nodeId) return;
        if (this.onJumpToNode) {
            this.onJumpToNode(nodeId);
        } else if (typeof window !== 'undefined' && window.focusCanvasNode) {
            window.focusCanvasNode(nodeId);
        } else {
            console.log(`[GenerationTaskShelf] Jump to canvas node: ${nodeId}`);
        }
    }

    /**
     * 渲染 DOM
     */
    render() {
        if (typeof document === 'undefined') return;

        if (!this.containerEl) {
            let el = document.getElementById('generation-task-shelf-container');
            if (!el) {
                el = document.createElement('div');
                el.id = 'generation-task-shelf-container';
                el.className = 'generation-task-shelf-container';
                document.body.appendChild(el);
            }
            this.containerEl = el;
        }

        if (!this.isOpen) {
            this.containerEl.classList.remove('generation-shelf-visible');
            return;
        }

        this.containerEl.classList.add('generation-shelf-visible');

        const filterTabs = ['all', 'running', 'succeeded', 'failed', 'cancelled'];
        
        const tasksHtml = this.tasks.length === 0 ? `
            <div class="generation-shelf-empty">
                <p>暂无生成任务</p>
            </div>
        ` : this.tasks.map(t => {
            const status = t.status || 'unknown';
            const boundNodeId = t.node_id || t.bound_node_id || (t.config && t.config.node_id);
            const isCanCancel = ['queued', 'running', 'pending'].includes(status);
            const isCanRetry = ['failed', 'cancelled'].includes(status);

            return `
                <div class="generation-task-card status-${status}">
                    <div class="card-header">
                        <span class="task-title">${t.prompt || t.title || `Task #${t.id.substring(0, 8)}`}</span>
                        <span class="task-status-badge status-${status}">${status.toUpperCase()}</span>
                    </div>
                    <div class="card-meta">
                        <span class="task-time">${new Date(t.created_at || Date.now()).toLocaleTimeString()}</span>
                        ${t.engine ? `<span class="task-engine">${t.engine}</span>` : ''}
                    </div>
                    ${t.error_message ? `<div class="task-error-msg">${t.error_message}</div>` : ''}
                    <div class="card-actions">
                        ${boundNodeId ? `
                            <button class="btn btn-xs btn-secondary btn-jump-node" data-node-id="${boundNodeId}">定位节点</button>
                        ` : ''}
                        ${isCanCancel ? `
                            <button class="btn btn-xs btn-danger btn-cancel-task" data-task-id="${t.id}">取消</button>
                        ` : ''}
                        ${isCanRetry ? `
                            <button class="btn btn-xs btn-primary btn-retry-task" data-task-id="${t.id}">重试</button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        this.containerEl.innerHTML = `
            <div class="generation-shelf-drawer">
                <div class="generation-shelf-header">
                    <h3>⚡ 统一生成任务架</h3>
                    <button class="generation-shelf-close" id="gen-shelf-close">&times;</button>
                </div>
                <div class="generation-shelf-tabs">
                    ${filterTabs.map(tab => `
                        <button class="shelf-tab-btn ${this.statusFilter === tab ? 'active' : ''}" data-tab="${tab}">
                            ${tab.toUpperCase()}
                        </button>
                    `).join('')}
                </div>
                <div class="generation-shelf-body">
                    ${tasksHtml}
                </div>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        if (!this.containerEl) return;

        const closeBtn = this.containerEl.querySelector('#gen-shelf-close');
        if (closeBtn) closeBtn.onclick = () => this.closeShelf();

        const tabs = this.containerEl.querySelectorAll('.shelf-tab-btn');
        tabs.forEach(tab => {
            tab.onclick = () => {
                const targetTab = tab.getAttribute('data-tab');
                this.statusFilter = targetTab;
                this.loadTasks().then(() => this.render());
            };
        });

        const jumpBtns = this.containerEl.querySelectorAll('.btn-jump-node');
        jumpBtns.forEach(btn => {
            btn.onclick = () => {
                const nodeId = btn.getAttribute('data-node-id');
                this.jumpToNode(nodeId);
            };
        });

        const cancelBtns = this.containerEl.querySelectorAll('.btn-cancel-task');
        cancelBtns.forEach(btn => {
            btn.onclick = () => {
                const taskId = btn.getAttribute('data-task-id');
                this.cancelTask(taskId);
            };
        });

        const retryBtns = this.containerEl.querySelectorAll('.btn-retry-task');
        retryBtns.forEach(btn => {
            btn.onclick = () => {
                const taskId = btn.getAttribute('data-task-id');
                this.retryTask(taskId);
            };
        });
    }
}

export const generationTaskShelfController = new GenerationTaskShelfController();

if (typeof window !== 'undefined') {
    window.generationTaskShelfController = generationTaskShelfController;
    window.openGenerationTaskShelf = (filter) => generationTaskShelfController.openShelf(filter);
}
