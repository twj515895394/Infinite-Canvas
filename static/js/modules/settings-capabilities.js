/**
 * Legacy Frontend Settings Capabilities Detector (Native ESM)
 * 探查并格式化设置页 CLI runtime-capabilities 探测摘要（Codex, Gemini, 即梦等）。
 */

import { v2ApiClient } from './v2-api-client.js';

export class SettingsCapabilitiesDetector {
    constructor(options = {}) {
        this.apiClient = options.apiClient || v2ApiClient;
        this.containerEl = options.containerEl || null;
        this.capabilitiesData = null;
    }

    /**
     * 查询 API 端点获取 CLI 探测能力
     */
    async fetchCapabilities() {
        try {
            const data = await this.apiClient.runtimeCapabilities.get();
            this.capabilitiesData = data;
            return data;
        } catch (err) {
            console.warn('[SettingsCapabilities] 获取 CLI 探测结果失败:', err);
            this.capabilitiesData = {
                cli_tools: [
                    { name: 'codex', ready: false, reason: 'Probe failed or not installed' },
                    { name: 'gemini', ready: false, reason: 'Probe failed or not installed' }
                ]
            };
            return this.capabilitiesData;
        }
    }

    /**
     * 格式化输出 CLI 能力卡片摘要 HTML
     */
    formatSummaryHtml() {
        if (!this.capabilitiesData || !Array.isArray(this.capabilitiesData.cli_tools)) {
            return `<div class="capabilities-summary-empty">未获取到 CLI 能力探测数据</div>`;
        }

        const tools = this.capabilitiesData.cli_tools;
        const html = tools.map(tool => {
            const isReady = tool.ready || tool.status === 'ready' || tool.available;
            const statusClass = isReady ? 'status-ready' : 'status-unavailable';
            const statusText = isReady ? '就绪 (READY)' : '未就绪 (UNAVAILABLE)';

            return `
                <div class="capability-tool-card ${statusClass}">
                    <div class="tool-head">
                        <span class="tool-name">⚡ ${tool.name || tool.id}</span>
                        <span class="tool-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="tool-meta">
                        ${tool.executable_path ? `<div class="tool-path">路径: <code>${tool.executable_path}</code></div>` : ''}
                        ${tool.reason || tool.detail ? `<div class="tool-reason">${tool.reason || tool.detail}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="capabilities-summary-container">
                <div class="capabilities-summary-header">
                    <h4>本机 CLI 执行环境探查</h4>
                    <button class="btn btn-xs btn-secondary" id="capabilities-refresh-btn">重新探测</button>
                </div>
                <div class="capabilities-summary-grid">
                    ${html}
                </div>
                <div class="capabilities-summary-footer">
                    <p>💡 如需添加或修改 Runtime 配置，请前往 <a href="#agent-center" id="capabilities-goto-center">Agent Center</a>。</p>
                </div>
            </div>
        `;
    }

    /**
     * 挂载并渲染 DOM
     */
    async renderTo(element) {
        if (!element) return;
        this.containerEl = element;
        await this.fetchCapabilities();
        element.innerHTML = this.formatSummaryHtml();
        this.bindEvents();
    }

    bindEvents() {
        if (!this.containerEl) return;

        const refreshBtn = this.containerEl.querySelector('#capabilities-refresh-btn');
        if (refreshBtn) {
            refreshBtn.onclick = async () => {
                refreshBtn.disabled = true;
                refreshBtn.textContent = '探测中...';
                await this.fetchCapabilities();
                this.containerEl.innerHTML = this.formatSummaryHtml();
                this.bindEvents();
            };
        }

        const gotoCenterLink = this.containerEl.querySelector('#capabilities-goto-center');
        if (gotoCenterLink) {
            gotoCenterLink.onclick = (e) => {
                e.preventDefault();
                if (typeof window !== 'undefined' && window.openAgentCenter) {
                    window.openAgentCenter();
                } else if (typeof window !== 'undefined') {
                    window.location.hash = '#agent-center';
                }
            };
        }
    }
}

export const settingsCapabilitiesDetector = new SettingsCapabilitiesDetector();

if (typeof window !== 'undefined') {
    window.settingsCapabilitiesDetector = settingsCapabilitiesDetector;
}
