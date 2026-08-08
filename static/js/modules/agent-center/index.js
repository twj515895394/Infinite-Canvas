/**
 * Agent Center Shell Controller (Native ESM)
 * 职责：编排 RuntimesView, AgentsView, SkillsView, TasksView 四大子视图，集中管理数据加载与 Tab 切换。
 */

import { v2ApiClient } from '../v2-api-client.js?v=2026.08.07.999';
import { RuntimesView } from './runtimes-view.js?v=2026.08.07.999';
import { AgentsView } from './agents-view.js?v=2026.08.07.999';
import { SkillsView } from './skills-view.js?v=2026.08.07.999';
import { TasksView } from './tasks-view.js?v=2026.08.07.999';

export class AgentCenter {
    constructor(options = {}) {
        this.apiClient = options.apiClient || v2ApiClient;
        this.container = options.container || null;
        this.activeTab = options.activeTab || 'runtimes';

        this.data = {
            runtimes: [],
            agents: [],
            skills: [],
            tasks: [],
            taskFilter: 'all'
        };

        const refreshFn = () => this.loadAllData().then(() => this.render());

        this.runtimesView = new RuntimesView({ apiClient: this.apiClient, onRefresh: refreshFn });
        this.agentsView = new AgentsView({ apiClient: this.apiClient, onRefresh: refreshFn });
        this.skillsView = new SkillsView({ apiClient: this.apiClient, onRefresh: refreshFn });
        this.tasksView = new TasksView({
            apiClient: this.apiClient,
            onRefresh: refreshFn,
            onFilterChange: (newFilter) => {
                this.data.taskFilter = newFilter;
                return refreshFn();
            }
        });

        if (typeof document !== 'undefined' && options.autoInit !== false && this.container) {
            this.init();
        }
    }

    init(containerEl) {
        if (containerEl) {
            this.container = containerEl;
        } else if (!this.container && typeof document !== 'undefined') {
            let el = document.getElementById('agent-center-container');
            if (!el) {
                el = document.createElement('div');
                el.id = 'agent-center-container';
                document.body.appendChild(el);
            }
            this.container = el;
        }
        if (this.container) {
            this.container.classList.add('agent-center-shell');
        }
        this.render();
        return this.loadAllData().then(() => this.render());
    }

    async loadAllData() {
        try {
            const [rtpResp, agtResp, sklResp, tskResp] = await Promise.all([
                this.apiClient.agents.listRuntimes().catch(err => { console.warn('[AgentCenter] listRuntimes failed:', err); return { items: [] }; }),
                this.apiClient.agents.listProfiles().catch(err => { console.warn('[AgentCenter] listProfiles failed:', err); return { items: [] }; }),
                this.apiClient.agents.listSkills().catch(err => { console.warn('[AgentCenter] listSkills failed:', err); return { items: [] }; }),
                this.apiClient.agents.listTasks(this.data.taskFilter !== 'all' ? { status: this.data.taskFilter } : {}).catch(err => { console.warn('[AgentCenter] listTasks failed:', err); return { items: [] }; })
            ]);

            this.data.runtimes = rtpResp?.items || rtpResp?.runtimes || [];
            this.data.agents = agtResp?.items || agtResp?.profiles || [];
            this.data.skills = sklResp?.items || sklResp?.skills || [];
            this.data.tasks = tskResp?.items || tskResp?.tasks || [];
        } catch (err) {
            console.error('[AgentCenter] Load data error:', err);
        }
    }

    setActiveTab(tabName) {
        this.activeTab = tabName;
        this.render();
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="agent-center-header">
                <div class="agent-center-title">
                    <i data-lucide="bot"></i>
                    <span>Agent 工作台控制中心</span>
                </div>
                <div class="agent-center-nav">
                    <button type="button" class="nav-tab ${this.activeTab === 'runtimes' ? 'active' : ''}" data-tab="runtimes">
                        <i data-lucide="cpu"></i> 执行环境 (Runtimes)
                    </button>
                    <button type="button" class="nav-tab ${this.activeTab === 'agents' ? 'active' : ''}" data-tab="agents">
                        <i data-lucide="bot"></i> 智能体 (Agents)
                    </button>
                    <button type="button" class="nav-tab ${this.activeTab === 'skills' ? 'active' : ''}" data-tab="skills">
                        <i data-lucide="sparkles"></i> 技能库 (Skills)
                    </button>
                    <button type="button" class="nav-tab ${this.activeTab === 'tasks' ? 'active' : ''}" data-tab="tasks">
                        <i data-lucide="list-todo"></i> 任务记录 (Tasks)
                    </button>
                </div>
            </div>
            <div class="agent-center-body">
                ${this.renderActiveTabContent()}
            </div>
        `;

        this.bindEvents();
        if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
            try { window.lucide.createIcons(); } catch (e) {}
        }
    }

    renderActiveTabContent() {
        switch (this.activeTab) {
            case 'runtimes':
                return this.runtimesView.render(this.data.runtimes);
            case 'agents':
                return this.agentsView.render(this.data.agents);
            case 'skills':
                return this.skillsView.render(this.data.skills);
            case 'tasks':
                return this.tasksView.render(this.data.tasks, this.data.taskFilter);
            default:
                return '<div>未知 Tab</div>';
        }
    }

    bindEvents() {
        if (!this.container) return;

        this.container.querySelectorAll('.nav-tab').forEach(tabBtn => {
            tabBtn.onclick = () => {
                const target = tabBtn.getAttribute('data-tab');
                this.setActiveTab(target);
            };
        });

        switch (this.activeTab) {
            case 'runtimes':
                this.runtimesView.bindEvents(this.container);
                break;
            case 'agents':
                this.agentsView.bindEvents(this.container, this.data.runtimes);
                break;
            case 'skills':
                this.skillsView.bindEvents(this.container);
                break;
            case 'tasks':
                this.tasksView.bindEvents(this.container);
                break;
        }
    }
}

export const globalAgentCenter = new AgentCenter({ autoInit: false });

export const agentCenterShell = {
    init(mountEl) {
        return globalAgentCenter.init(mountEl);
    }
};

if (typeof window !== 'undefined') {
    window.AgentCenter = AgentCenter;
    window.agentCenter = globalAgentCenter;
    window.globalAgentCenter = globalAgentCenter;
    window.agentCenterShell = agentCenterShell;
}
