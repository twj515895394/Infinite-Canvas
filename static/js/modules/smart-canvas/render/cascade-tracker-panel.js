/**
 * Smart Canvas Cascade Tracker Panel (Native ESM UI)
 * 级联运行追踪面板：展现节点排队/运行/完成/失败、轮次序号、边等待/激活/完成、可读错误摘要及停止操作。
 */

export class CascadeTrackerPanel {
    constructor(options = {}) {
        this.statusBus = options.statusBus || null;
        this.tracker = options.tracker || null;
        this.container = options.container || null;
        this.visible = false;
        this._unsubscribeBus = null;

        if (typeof document !== 'undefined') {
            this.init();
        }
    }

    init() {
        if (!this.container && typeof document !== 'undefined') {
            let el = document.getElementById('cascade-tracker-panel');
            if (!el) {
                el = document.createElement('div');
                el.id = 'cascade-tracker-panel';
                el.className = 'cascade-tracker-panel glass-panel hidden';
                document.body.appendChild(el);
            }
            this.container = el;
        }

        if (this.statusBus) {
            this._unsubscribeBus = this.statusBus.subscribe(() => {
                if (this.visible) {
                    this.render();
                }
            });
        }
    }

    show() {
        this.visible = true;
        if (this.container) {
            this.container.classList.remove('hidden');
        }
        this.render();
    }

    hide() {
        this.visible = false;
        if (this.container) {
            this.container.classList.add('hidden');
        }
    }

    toggle() {
        if (this.visible) this.hide();
        else this.show();
    }

    getProjectionData() {
        if (this.tracker) {
            return this.tracker.getProjection();
        }
        return {
            runId: null,
            tailNodeId: null,
            isRunning: false,
            isStopping: false,
            currentRoundIndex: 0,
            totalRounds: 0,
            nodeStates: {},
            edgeStates: {},
            errors: []
        };
    }

    formatStatusBadge(status) {
        const map = {
            wait: { text: '等待中', class: 'badge-wait' },
            queued: { text: '排队中', class: 'badge-wait' },
            running: { text: '运行中', class: 'badge-running' },
            success: { text: '已完成', class: 'badge-success' },
            done: { text: '已完成', class: 'badge-success' },
            failed: { text: '失败', class: 'badge-failed' },
            idle: { text: '空闲', class: 'badge-idle' }
        };
        const item = map[status] || { text: status || '未知', class: 'badge-idle' };
        return `<span class="tracker-badge ${item.class}">${item.text}</span>`;
    }

    render() {
        if (!this.container) return;

        const proj = this.getProjectionData();
        const nodeEntries = Object.entries(proj.nodeStates);
        const edgeEntries = Object.entries(proj.edgeStates);

        const stopBtnHtml = proj.isRunning && !proj.isStopping
            ? `<button type="button" class="btn-tracker-stop" id="btn-cascade-stop">停止级联</button>`
            : (proj.isStopping ? `<span class="stopping-tag">正在停止...</span>` : '');

        const nodeItemsHtml = nodeEntries.map(([nodeId, state]) => {
            const errorObj = proj.errors.find(e => e.nodeId === nodeId);
            const errorHtml = errorObj ? `<div class="tracker-error-msg">${this.escapeHtml(errorObj.errorMsg)}</div>` : '';
            return `
                <div class="tracker-node-row" data-node-id="${this.escapeHtml(nodeId)}">
                    <span class="node-id-label">${this.escapeHtml(nodeId)}</span>
                    ${this.formatStatusBadge(state)}
                    ${errorHtml}
                </div>
            `;
        }).join('');

        const edgeItemsHtml = edgeEntries.map(([edgeId, state]) => {
            return `
                <div class="tracker-edge-row">
                    <span class="edge-id-label">${this.escapeHtml(edgeId)}</span>
                    ${this.formatStatusBadge(state)}
                </div>
            `;
        }).join('');

        this.container.innerHTML = `
            <div class="tracker-header">
                <div class="tracker-title">
                    <i data-lucide="activity"></i>
                    <span>级联运行追踪</span>
                </div>
                <div class="tracker-actions">
                    ${stopBtnHtml}
                    <button type="button" class="btn-tracker-close" id="btn-cascade-panel-close">&times;</button>
                </div>
            </div>
            <div class="tracker-summary">
                <span>轮次: ${proj.currentRoundIndex} / ${proj.totalRounds}</span>
                <span>状态: ${proj.isRunning ? (proj.isStopping ? '停止中' : '运行中') : '就绪/完成'}</span>
            </div>
            <div class="tracker-section">
                <div class="section-title">节点状态 (${nodeEntries.length})</div>
                <div class="tracker-node-list">
                    ${nodeItemsHtml || '<div class="tracker-empty">暂无活跃级联链节点</div>'}
                </div>
            </div>
            ${edgeEntries.length > 0 ? `
                <div class="tracker-section">
                    <div class="section-title">边状态 (${edgeEntries.length})</div>
                    <div class="tracker-edge-list">
                        ${edgeItemsHtml}
                    </div>
                </div>
            ` : ''}
        `;

        this.bindEvents();
    }

    bindEvents() {
        if (!this.container) return;

        const closeBtn = this.container.querySelector('#btn-cascade-panel-close');
        if (closeBtn) {
            closeBtn.onclick = () => this.hide();
        }

        const stopBtn = this.container.querySelector('#btn-cascade-stop');
        if (stopBtn && this.tracker) {
            stopBtn.onclick = () => {
                this.tracker.stop();
                this.render();
            };
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    destroy() {
        if (this._unsubscribeBus) {
            this._unsubscribeBus();
        }
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}

export const globalCascadeTrackerPanel = new CascadeTrackerPanel();

if (typeof window !== 'undefined') {
    window.CascadeTrackerPanel = CascadeTrackerPanel;
    window.cascadeTrackerPanel = globalCascadeTrackerPanel;
    window.globalCascadeTrackerPanel = globalCascadeTrackerPanel;
}
