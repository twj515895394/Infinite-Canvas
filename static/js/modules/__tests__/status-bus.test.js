import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeStatusBus } from '../smart-canvas/core/status-bus.js';

test('NodeStatusBus setStatus and getStatus work correctly', () => {
    const bus = new NodeStatusBus();
    const status = bus.setStatus('node_1', { status: 'running', loopRound: 2 });

    assert.equal(status.nodeId, 'node_1');
    assert.equal(status.status, 'running');
    assert.equal(status.loopRound, 2);

    const fetched = bus.getStatus('node_1');
    assert.equal(fetched.status, 'running');
    assert.equal(fetched.loopRound, 2);
});

test('NodeStatusBus notifies subscribers on setStatus', () => {
    const bus = new NodeStatusBus();
    let notifiedNodeId = '';
    let notifiedStatus = null;

    bus.subscribe((nodeId, status) => {
        notifiedNodeId = nodeId;
        notifiedStatus = status;
    });

    bus.setStatus('node_abc', { status: 'failed', errorMsg: 'Provider error' });

    assert.equal(notifiedNodeId, 'node_abc');
    assert.equal(notifiedStatus.status, 'failed');
    assert.equal(notifiedStatus.errorMsg, 'Provider error');
});

test('NodeStatusBus clearEphemeral resets transient queued/running states', () => {
    const bus = new NodeStatusBus();
    bus.setStatus('node_running', { status: 'running' });
    bus.setStatus('node_queued', { status: 'queued' });
    bus.setStatus('node_done', { status: 'success' });
    bus.setStatus('node_err', { status: 'failed' });

    bus.clearEphemeral();

    assert.equal(bus.getStatus('node_running').status, 'idle');
    assert.equal(bus.getStatus('node_queued').status, 'idle');
    assert.equal(bus.getStatus('node_done').status, 'success');
    assert.equal(bus.getStatus('node_err').status, 'failed');
});

test('NodeStatusBus snapshot produces clean non-leaking copy', () => {
    const bus = new NodeStatusBus();
    bus.setStatus('node_x', { status: 'success' });
    const snap = bus.snapshot();

    assert.equal(snap.node_x.status, 'success');
    snap.node_x.status = 'mutated';

    assert.equal(bus.getStatus('node_x').status, 'success');
});
