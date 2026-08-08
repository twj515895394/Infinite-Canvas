import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentDockController } from '../agent-dock.js';

function createMockApiClient() {
    const profiles = [{ id: 'ag_01', name: 'Claude Code Agent', model: 'claude-3-7-sonnet' }];
    const skills = [{ id: 'sk_01', name: 'Code Review Skill', version: '1.0' }];
    const tasks = new Map();
    let sessionCounter = 1;
    let taskCounter = 1;

    return {
        agents: {
            listProfiles: async () => ({ items: profiles }),
            listSkills: async () => ({ items: skills }),
            createSession: async (body) => ({
                id: `ses_${sessionCounter++}`,
                title: body.title,
                agent_profile_id: body.agent_profile_id
            }),
            createTask: async (body) => {
                const task = {
                    id: `tsk_${taskCounter++}`,
                    session_id: body.session_id,
                    agent_profile_id: body.agent_profile_id,
                    skill_id: body.skill_id,
                    instruction: body.instruction,
                    status: 'pending',
                    context_refs: body.context_refs || []
                };
                tasks.set(task.id, task);
                return task;
            },
            getTask: async (id) => tasks.get(id) || { id, status: 'succeeded', result: 'Success Output' },
            cancelTask: async (id) => {
                const t = tasks.get(id) || { id };
                t.status = 'cancelled';
                return t;
            },
            getTaskEvents: async () => ({ items: [{ event_type: 'log', message: 'Step 1 complete' }] })
        },
        assets: {
            ingestAsset: async () => ({ id: 'ast_999', title: 'Saved Result' })
        }
    };
}

test('AgentDockController opens and loads agent profiles and skills', async () => {
    const mockClient = createMockApiClient();
    const dock = new AgentDockController({ apiClient: mockClient });

    await dock.openDock({ agentProfileId: 'ag_01' });

    assert.equal(dock.isOpen, true);
    assert.equal(dock.profiles.length, 1);
    assert.equal(dock.selectedAgentId, 'ag_01');
});

test('AgentDockController resets task state when switching agent', async () => {
    const mockClient = createMockApiClient();
    const dock = new AgentDockController({ apiClient: mockClient });
    await dock.openDock({ agentProfileId: 'ag_01' });

    dock.activeTaskId = 'tsk_01';
    dock.selectedSkillId = 'sk_01';

    dock.setAgent('ag_02');

    assert.equal(dock.selectedAgentId, 'ag_02');
    assert.equal(dock.selectedSkillId, null);
    assert.equal(dock.activeTaskId, null);
});

test('AgentDockController submits task and creates session', async () => {
    const mockClient = createMockApiClient();
    const dock = new AgentDockController({ apiClient: mockClient });
    await dock.openDock({ agentProfileId: 'ag_01' });

    const task = await dock.submitTask('Analyze codebase performance');

    assert.ok(dock.sessionId.startsWith('ses_'));
    assert.ok(task.id.startsWith('tsk_'));
    assert.equal(dock.activeTaskId, task.id);
    assert.equal(task.instruction, 'Analyze codebase performance');
});

test('AgentDockController cancels active task', async () => {
    const mockClient = createMockApiClient();
    const dock = new AgentDockController({ apiClient: mockClient });
    await dock.openDock({ agentProfileId: 'ag_01' });

    const task = await dock.submitTask('Long running calculation');
    await dock.cancelActiveTask();

    assert.equal(dock.activeTask.status, 'cancelled');
});
