/**
 * Agent Center - Skills 视图 (Native ESM Architecture)
 * 职责：负责 Skills 技能列表渲染、Discover 扫描与 ZIP/Path 导入交互。
 * 遵循 <= 900 行规范 (SRP 模块化)
 */

import { AgentToast, AgentConfirm } from './ui-feedback.js?v=2026.08.07.999';

export class SkillsView {
    constructor(options = {}) {
        this.apiClient = options.apiClient;
        this.onRefresh = options.onRefresh || (() => {});
    }

    render(skills = []) {
        if (skills.length === 0) {
            return `
                <div class="empty-state-card">
                    <div class="empty-title">尚未导入 Skill 技能包</div>
                    <div class="empty-desc">导入包含 skill.yaml + SKILL.md 的 Skill 包或进行内置技能扫描索引。</div>
                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 16px;">
                        <button type="button" class="btn-secondary" id="btn-discover-skills">
                            <i data-lucide="compass"></i> 扫描发现 Skills
                        </button>
                        <button type="button" class="btn-primary" id="btn-import-skill">
                            <i data-lucide="upload-cloud"></i> 导入 Skill (ZIP/Path)
                        </button>
                    </div>
                </div>
            `;
        }

        const items = skills.map(skl => `
            <div class="agent-card" data-id="${skl.id}">
                <div class="card-header">
                    <span class="card-name">
                        <i data-lucide="sparkles"></i> ${this._escapeHtml(skl.name)}
                    </span>
                    <span class="card-version">v${skl.active_version || skl.version || '1.0.0'}</span>
                </div>
                <div class="card-details">
                    <div><strong>Skill Key:</strong> <code>${this._escapeHtml(skl.skill_key || skl.name)}</code></div>
                    <div><strong>描述:</strong> ${this._escapeHtml(skl.description || '内置技能包')}</div>
                    <div><strong>兼容 Runtime 数:</strong> ${skl.compatible_runtime_count || 0}</div>
                </div>
                <div class="card-actions">
                    <button type="button" class="btn-sm btn-secondary" data-action="test-skill" data-id="${skl.id}">
                        <i data-lucide="play"></i> 测试技能 (Test)
                    </button>
                </div>
            </div>
        `).join('');

        return `
            <div class="tab-toolbar">
                <button type="button" class="btn-secondary" id="btn-discover-skills">
                    <i data-lucide="compass"></i> 扫描发现 Skills
                </button>
                <button type="button" class="btn-primary" id="btn-import-skill">
                    <i data-lucide="upload-cloud"></i> 导入 Skill (ZIP/Path)
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

        const discoverBtn = container.querySelector('#btn-discover-skills');
        if (discoverBtn) {
            discoverBtn.onclick = async () => {
                discoverBtn.disabled = true;
                try {
                    const res = await this.apiClient.agents.discoverSkills();
                    AgentToast.success(`扫描发现成功! 找到 ${res.count || 0} 个 Skill 技能包。`);
                    await this.onRefresh();
                } catch (e) {
                    AgentToast.error(`扫描失败: ${e.message}`);
                } finally {
                    discoverBtn.disabled = false;
                }
            };
        }

        const importBtn = container.querySelector('#btn-import-skill');
        if (importBtn) {
            importBtn.onclick = () => this._showImportModal();
        }

        container.querySelectorAll('[data-action="test-skill"]').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.getAttribute('data-id');
                btn.disabled = true;
                try {
                    const res = await this.apiClient.agents.testSkill(id);
                    AgentToast.success(`Skill 测试通过! 版本: ${res.version || '1.0.0'}, 状态: ${res.status || 'valid'}`);
                } catch (e) {
                    AgentToast.error(`测试失败: ${e.message}`);
                } finally {
                    btn.disabled = false;
                }
            };
        });
    }

    _showImportModal() {
        const modalHtml = `
            <div class="agent-modal-overlay" id="skill-modal-overlay">
                <div class="agent-modal">
                    <div class="modal-header">
                        <div class="modal-title">导入 Skill 技能包</div>
                        <button type="button" class="modal-close" id="modal-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>服务器本地目录路径 (Server Path)</label>
                            <input type="text" id="skl-path" placeholder="例如: data/studio-v2/skills/installed/refiner" value="">
                        </div>
                        <div class="form-group">
                            <label>或选择 ZIP 压缩包 (ZIP File)</label>
                            <input type="file" id="skl-file" accept=".zip">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn-secondary" id="modal-cancel-btn">取消</button>
                        <button type="button" class="btn-primary" id="modal-submit-btn">提交导入</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const overlay = document.getElementById('skill-modal-overlay');

        const close = () => overlay.remove();
        overlay.querySelector('#modal-close-btn').onclick = close;
        overlay.querySelector('#modal-cancel-btn').onclick = close;

        overlay.querySelector('#modal-submit-btn').onclick = async () => {
            const pathVal = overlay.querySelector('#skl-path').value.trim();
            const fileEl = overlay.querySelector('#skl-file');

            const formData = new FormData();
            if (fileEl.files && fileEl.files[0]) {
                formData.append('file', fileEl.files[0]);
            } else if (pathVal) {
                formData.append('path', pathVal);
            } else {
                return AgentToast.error('请选择 ZIP 文件或输入本地路径');
            }

            try {
                await this.apiClient.agents.importSkill(formData);
                AgentToast.success('Skill 导入成功');
                close();
                await this.onRefresh();
            } catch (e) {
                AgentToast.error(`Skill 导入失败: ${e.message}`);
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
