/**
 * Agent Center - Runtimes 视图 (Native ESM Architecture)
 * 职责：负责 Runtimes 列表渲染、Probe 探测、新建 modal、启用/禁用与删除交互。
 * 遵循 <= 900 行规范 (SRP 模块化)
 */

import { AgentToast, AgentConfirm } from './ui-feedback.js?v=2026.08.07.999';

export class RuntimesView {
    constructor(options = {}) {
        this.apiClient = options.apiClient;
        this.onRefresh = options.onRefresh || (() => {});
    }

    render(runtimes = []) {
        if (runtimes.length === 0) {
            return `
                <div class="empty-state-card">
                    <div class="empty-title">尚未配置 Agent 执行环境 (Runtime)</div>
                    <div class="empty-desc">配置本机 CLI（Codex, Claude, Pi 等）或 HTTP 接口以解锁 Agent 真实执行能力。</div>
                    <button type="button" class="btn-primary" id="btn-create-runtime">
                        <i data-lucide="plus"></i> 新建 Runtime
                    </button>
                </div>
            `;
        }

        const items = runtimes.map(rt => {
            const lastError = rt.last_probe_error;
            const lastProbe = rt.last_probe;
            let probeBoxHtml = '';
            if (rt.status === 'unavailable' && lastError) {
                const errorText = lastError.detail || lastError.title || 'CLI 未找到或探针无法响应';
                probeBoxHtml = `
                    <div class="probe-info-box probe-error">
                        <i data-lucide="alert-circle" style="width:14px;height:14px;flex-shrink:0;margin-top:2px;"></i>
                        <div><strong>探测失败:</strong> ${this._escapeHtml(errorText)}</div>
                    </div>
                `;
            } else if (rt.status === 'ready') {
                const ver = lastProbe?.version || rt.version;
                const caps = (rt.capabilities && rt.capabilities.length > 0) ? rt.capabilities.join(', ') : 'text-generation';
                probeBoxHtml = `
                    <div class="probe-info-box probe-ready">
                        <i data-lucide="check-circle-2" style="width:14px;height:14px;flex-shrink:0;margin-top:2px;"></i>
                        <div><strong>探测就绪</strong> ${ver ? `(${this._escapeHtml(ver)})` : ''} — 能力: ${this._escapeHtml(caps)}</div>
                    </div>
                `;
            }

            return `
            <div class="agent-card" data-id="${rt.id}">
                <div class="card-header">
                    <span class="card-name">
                        <i data-lucide="cpu"></i> ${this._escapeHtml(rt.name)}
                    </span>
                    <span class="status-chip chip-${rt.status || 'unknown'}">${rt.status || 'unknown'}</span>
                </div>
                <div class="card-details">
                    <div><strong>类型:</strong> ${rt.adapter_type}</div>
                    <div><strong>默认模型:</strong> ${this._escapeHtml(rt.default_model || '系统默认')}</div>
                    ${rt.executable_path ? `<div><strong>CLI 路径:</strong> <code>${this._escapeHtml(rt.executable_path)}</code></div>` : ''}
                    ${rt.endpoint_url ? `<div><strong>HTTP 端点:</strong> <code>${this._escapeHtml(rt.endpoint_url)}</code></div>` : ''}
                    ${probeBoxHtml}
                </div>
                <div class="card-actions">
                    <button type="button" class="btn-sm btn-secondary" data-action="probe" data-id="${rt.id}">
                        <i data-lucide="zap"></i> 探测 (Probe)
                    </button>
                    <button type="button" class="btn-sm btn-secondary" data-action="toggle" data-id="${rt.id}" data-rev="${rt.revision}" data-enabled="${rt.enabled}">
                        <i data-lucide="${rt.enabled ? 'power' : 'play'}"></i> ${rt.enabled ? '禁用' : '启用'}
                    </button>
                    <button type="button" class="btn-sm btn-danger" data-action="delete" data-id="${rt.id}">
                        <i data-lucide="trash-2"></i> 删除
                    </button>
                </div>
            </div>
            `;
        }).join('');

        return `
            <div class="tab-toolbar">
                <button type="button" class="btn-primary" id="btn-create-runtime">
                    <i data-lucide="plus"></i> 新建 Runtime
                </button>
            </div>
            <div class="cards-grid">${items}</div>
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

        const createBtn = container.querySelector('#btn-create-runtime');
        if (createBtn) {
            createBtn.onclick = () => this._showCreateModal();
        }

        container.querySelectorAll('[data-action="probe"]').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.getAttribute('data-id');
                btn.disabled = true;
                btn.innerHTML = '<i data-lucide="loader"></i> 探测中...';
                try {
                    const res = await this.apiClient.agents.probeRuntime(id);
                    const probe = res.probe || {};
                    if (probe.status === 'ready') {
                        const versionStr = probe.version ? ` (${probe.version})` : '';
                        AgentToast.success(`Runtime 探针测试就绪${versionStr}`);
                    } else {
                        const errText = probe.error?.detail || probe.error?.title || 'CLI 未找到或探测未回应';
                        AgentToast.error(`Probe 探测未就绪: ${errText}`);
                    }
                    await this.onRefresh();
                } catch (e) {
                    AgentToast.error(`Probe 请求失败: ${e.message}`);
                } finally {
                    btn.disabled = false;
                }
            };
        });

        container.querySelectorAll('[data-action="toggle"]').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.getAttribute('data-id');
                const rev = Number(btn.getAttribute('data-rev')) || 1;
                const enabled = btn.getAttribute('data-enabled') === 'true';
                try {
                    await this.apiClient.agents.patchRuntime(id, {
                        base_revision: rev,
                        enabled: !enabled
                    });
                    AgentToast.info(`Runtime ${id} 已${!enabled ? '启用' : '禁用'}`);
                    await this.onRefresh();
                } catch (e) {
                    AgentToast.error(`操作失败: ${e.message}`);
                }
            };
        });

        container.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.getAttribute('data-id');
                await AgentConfirm.show({
                    title: '删除 Runtime',
                    message: `确定要删除 Runtime (${id}) 吗？此操作不可撤销。`,
                    confirmText: '彻底删除',
                    danger: true,
                    onConfirm: async () => {
                        await this.apiClient.agents.deleteRuntime(id);
                        AgentToast.success('Runtime 已删除');
                        await this.onRefresh();
                    }
                });
            };
        });
    }

    _showCreateModal() {
        const modalHtml = `
            <div class="agent-modal-overlay" id="runtime-modal-overlay">
                <div class="agent-modal">
                    <div class="modal-header">
                        <div class="modal-title">新建 Runtime</div>
                        <button type="button" class="modal-close" id="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Runtime 名称</label>
                            <input type="text" id="rt-name" placeholder="例如: Codex Local / Claude CLI" value="Codex CLI">
                        </div>
                        <div class="form-group">
                            <label>适配器类型 (Adapter Type)</label>
                            <select id="rt-type">
                                <option value="cli-stdio">cli-stdio (本地 CLI 可执行文件)</option>
                                <option value="http-json">http-json (远程 HTTP API 服务)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>可执行文件路径 (Executable Path)</label>
                            <input type="text" id="rt-exec" placeholder="codex / pi / python 或绝对路径" value="codex">
                            <small style="color:var(--text-muted, #64748b);font-size:11px;">填写 PATH 命令名称或全局绝对路径。探测会尝试执行 <code>&lt;path&gt; --version</code> 检测连通性。</small>
                        </div>
                        <div class="form-group">
                            <label>默认模型 (Default Model)</label>
                            <input type="text" id="rt-model" placeholder="gpt-4o / claude-3-5-sonnet" value="gpt-4o">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn-secondary" id="modal-cancel-btn">取消</button>
                        <button type="button" class="btn-primary" id="modal-submit-btn">创建 Runtime</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const overlay = document.getElementById('runtime-modal-overlay');

        const close = () => overlay.remove();
        overlay.querySelector('#modal-close-btn').onclick = close;
        overlay.querySelector('#modal-cancel-btn').onclick = close;

        overlay.querySelector('#modal-submit-btn').onclick = async () => {
            const name = overlay.querySelector('#rt-name').value.trim();
            const adapter_type = overlay.querySelector('#rt-type').value;
            const executable_path = overlay.querySelector('#rt-exec').value.trim();
            const default_model = overlay.querySelector('#rt-model').value.trim();

            if (!name) return AgentToast.error('请输入 Runtime 名称');

            try {
                await this.apiClient.agents.createRuntime({
                    name,
                    adapter_type,
                    executable_path: executable_path || undefined,
                    default_model: default_model || undefined
                });
                AgentToast.success(`Runtime "${name}" 创建成功`);
                close();
                await this.onRefresh();
            } catch (e) {
                AgentToast.error(`创建失败: ${e.message}`);
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
