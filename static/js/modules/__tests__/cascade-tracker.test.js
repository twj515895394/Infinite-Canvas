import test from 'node:test';
import assert from 'node:assert/strict';
import { CascadeTracker } from '../smart-canvas/core/cascade-tracker.js';
import { NodeStatusBus } from '../smart-canvas/core/status-bus.js';

test('canRun rejects invalid tail nodes and no-chain nodes', () => {
    const tracker = new CascadeTracker();
    const nodes = [
        { id: 'node_1', type: 'smart-prompt' },
        { id: 'node_2', type: 'smart-image' },
        { id: 'group_1', type: 'smart-group' }
    ];
    const connections = [
        { from: 'node_1', to: 'node_2' }
    ];

    assert.equal(tracker.canRun('', nodes, connections).reason, 'TAIL_MISSING');
    assert.equal(tracker.canRun('non_existent', nodes, connections).reason, 'TAIL_NOT_FOUND');
    assert.equal(tracker.canRun('group_1', nodes, connections).reason, 'GROUP_CANNOT_BE_TAIL');
    assert.equal(tracker.canRun('node_1', nodes, connections).reason, 'NO_UPSTREAM_CHAIN');
    assert.equal(tracker.canRun('node_2', nodes, connections).ok, true);
});

test('buildUpstreamGraph traces back from tail node to build node & edge sets', () => {
    const tracker = new CascadeTracker();
    const nodes = [
        { id: 'n1', type: 'smart-prompt' },
        { id: 'n2', type: 'smart-image' },
        { id: 'n3', type: 'smart-video' },
        { id: 'unrelated', type: 'smart-prompt' }
    ];
    const connections = [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' }
    ];

    const graph = tracker.buildUpstreamGraph('n3', nodes, connections);
    assert.deepEqual(graph.nodeIds.sort(), ['n1', 'n2', 'n3'].sort());
    assert.equal(graph.edges.length, 2);
});

test('scheduleRounds groups topological levels correctly', () => {
    const tracker = new CascadeTracker();
    const nodes = [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }];
    const edges = [
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3' }
    ];

    const rounds = tracker.scheduleRounds(nodes, edges);
    assert.deepEqual(rounds, [['n1'], ['n2'], ['n3']]);
});

test('getConcurrencyLimit enforces ComfyUI instance limit', () => {
    const tracker = new CascadeTracker();
    assert.equal(tracker.getConcurrencyLimit([{ type: 'smart-comfy' }]), 1);
    assert.equal(tracker.getConcurrencyLimit([{ type: 'smart-image' }]), 4);
});

test('CascadeTracker projection and stop flag update correctly', () => {
    const bus = new NodeStatusBus();
    const tracker = new CascadeTracker({ statusBus: bus });

    const nodes = [{ id: 'n1' }, { id: 'n2' }];
    const connections = [{ id: 'e1', from: 'n1', to: 'n2' }];

    tracker.start('n2', nodes, connections);
    assert.equal(bus.getStatus('n1').status, 'queued');

    tracker.updateNodeState('n1', 'running');
    assert.equal(bus.getStatus('n1').status, 'running');

    tracker.stop();
    const proj = tracker.getProjection();
    assert.equal(proj.isStopping, true);
    assert.equal(proj.tailNodeId, 'n2');
});
