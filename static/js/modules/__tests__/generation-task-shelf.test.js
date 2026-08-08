import test from 'node:test';
import assert from 'node:assert/strict';
import { GenerationTaskShelfController } from '../generation-task-shelf.js';

function createMockApiClient() {
    const tasks = [
        { id: 'gt_01', prompt: 'Landscape painting', status: 'running', engine: 'sdxl', node_id: 'node_100' },
        { id: 'gt_02', prompt: 'Portrait shot', status: 'succeeded', engine: 'comfyui' }
    ];

    return {
        tasks: {
            listGenerationTasks: async (query = {}) => {
                let list = [...tasks];
                if (query.status && query.status !== 'all') {
                    list = list.filter(t => t.status === query.status);
                }
                return { items: list };
            },
            cancelGenerationTask: async (id) => {
                const t = tasks.find(x => x.id === id);
                if (t) t.status = 'cancelled';
                return { success: true };
            },
            retryGenerationTask: async (id) => {
                const t = tasks.find(x => x.id === id);
                if (t) t.status = 'queued';
                return { success: true };
            }
        }
    };
}

test('GenerationTaskShelfController opens shelf and filters tasks by status', async () => {
    const mockClient = createMockApiClient();
    const shelf = new GenerationTaskShelfController({ apiClient: mockClient });

    await shelf.openShelf('running');
    assert.equal(shelf.isOpen, true);
    assert.equal(shelf.tasks.length, 1);
    assert.equal(shelf.tasks[0].id, 'gt_01');

    shelf.closeShelf();
    assert.equal(shelf.isOpen, false);
});

test('GenerationTaskShelfController cancels and retries tasks', async () => {
    const mockClient = createMockApiClient();
    const shelf = new GenerationTaskShelfController({ apiClient: mockClient });
    await shelf.openShelf('all');

    await shelf.cancelTask('gt_01');
    assert.equal(shelf.tasks.find(t => t.id === 'gt_01').status, 'cancelled');

    await shelf.retryTask('gt_01');
    assert.equal(shelf.tasks.find(t => t.id === 'gt_01').status, 'queued');
    shelf.closeShelf();
});

test('GenerationTaskShelfController invokes node jump callback', () => {
    let jumpedNodeId = null;
    const shelf = new GenerationTaskShelfController({
        onJumpToNode: (nodeId) => { jumpedNodeId = nodeId; }
    });

    shelf.jumpToNode('node_100');
    assert.equal(jumpedNodeId, 'node_100');
});
