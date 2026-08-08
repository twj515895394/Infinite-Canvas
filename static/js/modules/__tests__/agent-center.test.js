import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentCenter } from '../agent-center/index.js';
import { RuntimesView } from '../agent-center/runtimes-view.js';
import { AgentsView } from '../agent-center/agents-view.js';
import { SkillsView } from '../agent-center/skills-view.js';
import { TasksView } from '../agent-center/tasks-view.js';

test('RuntimesView renders empty card when no runtimes exist', () => {
    const view = new RuntimesView();
    const html = view.render([]);
    assert.ok(html.includes('尚未配置 Agent 执行环境'));
});

test('AgentsView renders agent cards correctly', () => {
    const view = new AgentsView();
    const html = view.render([{ id: 'agt_1', name: 'TestAgent', slug: 'test' }]);
    assert.ok(html.includes('TestAgent'));
    assert.ok(html.includes('@test'));
});

test('TasksView renders task status filter options', () => {
    const view = new TasksView();
    const html = view.render([{ id: 'tsk_1', status: 'running', instruction: 'Do something' }], 'running');
    assert.ok(html.includes('tsk_1'));
    assert.ok(html.includes('running'));
    assert.ok(html.includes('selected'));
});

test('AgentCenter shell initializes sub-views and switches active tab', async () => {
    const mockApiClient = {
        agents: {
            listRuntimes: async () => ({ items: [{ id: 'rtp_1', name: 'Codex', adapter_type: 'cli-stdio' }] }),
            listProfiles: async () => ({ items: [] }),
            listSkills: async () => ({ items: [] }),
            listTasks: async () => ({ items: [] }),
            probeRuntime: async (id) => ({ probe: { status: 'ready' } })
        }
    };

    const fakeContainer = {
        innerHTML: '',
        querySelectorAll: () => [],
        querySelector: () => null
    };

    const center = new AgentCenter({ apiClient: mockApiClient, container: fakeContainer });
    await center.loadAllData();
    center.render();

    assert.equal(center.data.runtimes.length, 1);
    assert.ok(fakeContainer.innerHTML.includes('Codex'));

    center.setActiveTab('tasks');
    assert.equal(center.activeTab, 'tasks');
    assert.ok(fakeContainer.innerHTML.includes('任务记录'));
});
