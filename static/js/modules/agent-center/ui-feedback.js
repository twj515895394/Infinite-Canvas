/**
 * Agent Center UI Feedback Utilities (Native ESM)
 * 职责：替代原生 HTML alert() 与 confirm() 弹窗，提供设计系统级 Toast 提示框与 Confirm 确认框。
 * 遵循 <= 900 行规范 (SRP 模块化)
 */

export class AgentToast {
    static show(message, type = 'info', duration = 3200) {
        if (typeof document === 'undefined') return;

        let container = document.getElementById('agent-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'agent-toast-container';
            container.className = 'agent-toast-container';
            document.body.appendChild(container);
        }

        const iconMap = {
            success: 'check-circle',
            error: 'alert-circle',
            info: 'info'
        };

        const icon = iconMap[type] || 'info';

        const toast = document.createElement('div');
        toast.className = `agent-toast toast-${type}`;
        toast.innerHTML = `
            <i data-lucide="${icon}" class="toast-icon"></i>
            <span class="toast-message">${this._escapeHtml(message)}</span>
        `;

        container.appendChild(toast);

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            try { window.lucide.createIcons(); } catch (e) {}
        }

        setTimeout(() => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 200);
        }, duration);
    }

    static success(msg) { this.show(msg, 'success'); }
    static error(msg) { this.show(msg, 'error'); }
    static info(msg) { this.show(msg, 'info'); }

    static _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

export class AgentConfirm {
    static show(options = {}) {
        const {
            title = '操作确认',
            message = '确定要执行此操作吗？',
            confirmText = '确定',
            cancelText = '取消',
            danger = false,
            onConfirm = async () => {}
        } = options;

        if (typeof document === 'undefined') return Promise.resolve(false);

        return new Promise((resolve) => {
            const modalHtml = `
                <div class="agent-modal-overlay" id="agent-confirm-overlay">
                    <div class="agent-modal" style="width: 420px;">
                        <div class="modal-header">
                            <div class="modal-title">${this._escapeHtml(title)}</div>
                            <button type="button" class="modal-close" id="confirm-close-btn">&times;</button>
                        </div>
                        <div class="modal-body" style="font-size: 13px; color: var(--text, #334155); line-height: 1.6;">
                            ${this._escapeHtml(message)}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" id="confirm-cancel-btn">${this._escapeHtml(cancelText)}</button>
                            <button type="button" class="${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok-btn">${this._escapeHtml(confirmText)}</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            const overlay = document.getElementById('agent-confirm-overlay');

            const close = (val) => {
                overlay.remove();
                resolve(val);
            };

            overlay.querySelector('#confirm-close-btn').onclick = () => close(false);
            overlay.querySelector('#confirm-cancel-btn').onclick = () => close(false);

            overlay.querySelector('#confirm-ok-btn').onclick = async () => {
                try {
                    await onConfirm();
                    close(true);
                } catch (e) {
                    AgentToast.error(`操作失败: ${e.message}`);
                    close(false);
                }
            };
        });
    }

    static _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
