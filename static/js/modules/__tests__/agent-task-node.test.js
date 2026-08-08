import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseAgentTaskConfig,
    validateAgentTaskConfig,
    canSubmitTask,
    clearSkillOnAgentChange,
    deriveContextFromInputs,
    createAgentTaskPayload,
    patchConfigWithTaskResult
} from '../smart-canvas/nodes/agent-task-node.js';

test('parseAgentTaskConfig normalizes raw config and bounds history', () => {
    const raw = {
        agent_profile_id: 'ag_123',
        instruction: '  Generate code  ',
        task_history: Array.from({ length: 15 }, (_, i) => `tsk_${i}`)
    };
    const parsed = parseAgentTaskConfig(raw);
    assert.equal(parsed.agent_profile_id, 'ag_123');
    assert.equal(parsed.instruction, '  Generate code  ');
    assert.equal(parsed.task_history.length, 10);
    assert.equal(parsed.task_history[0], 'tsk_5');
});

test('validateAgentTaskConfig checks required fields', () => {
    const invalid = validateAgentTaskConfig({});
    assert.equal(invalid.valid, false);
    assert.equal(invalid.errors.length, 2);

    const valid = validateAgentTaskConfig({
        agent_profile_id: 'ag_01',
        instruction: 'Review PR'
    });
    assert.equal(valid.valid, true);
    assert.equal(canSubmitTask({ agent_profile_id: 'ag_01', instruction: 'Review PR' }), true);
});

test('clearSkillOnAgentChange resets skill and session when agent changes', () => {
    const config = {
        agent_profile_id: 'ag_01',
        skill_id: 'sk_01',
        session_id: 'ses_01',
        instruction: 'Do work'
    };
    const sameAgent = clearSkillOnAgentChange(config, 'ag_01');
    assert.equal(sameAgent.skill_id, 'sk_01');

    const newAgent = clearSkillOnAgentChange(config, 'ag_02');
    assert.equal(newAgent.agent_profile_id, 'ag_02');
    assert.equal(newAgent.skill_id, null);
    assert.equal(newAgent.session_id, null);
});

test('deriveContextFromInputs extracts context from upstream nodes', () => {
    const nodeMap = new Map([
        ['node_1', { id: 'node_1', type: 'smart-asset', title: 'Header Image', asset_version_id: 'ast_v1' }],
        ['node_2', { id: 'node_2', type: 'prompt-node', title: 'System Prompt', prompt: 'Be helpful' }]
    ]);
    const edges = [
        { source: 'node_1', target: 'node_task' },
        { source: 'node_2', target: 'node_task' }
    ];

    const refs = deriveContextFromInputs(edges, nodeMap);
    assert.equal(refs.length, 2);
    assert.equal(refs[0].type, 'asset_version');
    assert.equal(refs[0].id, 'ast_v1');
    assert.equal(refs[1].type, 'text_node');
    assert.equal(refs[1].content, 'Be helpful');
});

test('createAgentTaskPayload and patchConfigWithTaskResult maintain task lifecycle', () => {
    const config = {
        agent_profile_id: 'ag_01',
        instruction: 'Run audit'
    };
    const payload = createAgentTaskPayload(config, [{ type: 'ref', id: '1' }]);
    assert.equal(payload.agent_profile_id, 'ag_01');
    assert.equal(payload.instruction, 'Run audit');
    assert.equal(payload.context_refs.length, 1);

    const patched = patchConfigWithTaskResult(config, {
        id: 'tsk_100',
        session_id: 'ses_100',
        status: 'succeeded',
        result: { summary: 'Audit clean' }
    });
    assert.equal(patched.active_task_id, 'tsk_100');
    assert.equal(patched.latest_successful_task_id, 'tsk_100');
    assert.equal(patched.task_history.includes('tsk_100'), true);
    assert.ok(patched.result_summary.includes('Audit clean'));
});
