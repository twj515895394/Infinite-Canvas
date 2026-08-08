import test from 'node:test';
import assert from 'node:assert/strict';
import { CascadeTrackerPanel } from '../smart-canvas/render/cascade-tracker-panel.js';
import { CascadeTracker } from '../smart-canvas/core/cascade-tracker.js';
import { NodeStatusBus } from '../smart-canvas/core/status-bus.js';

test('CascadeTrackerPanel formatting and projection HTML output', () => {
    const bus = new NodeStatusBus();
    const tracker = new CascadeTracker({ statusBus: bus });

    const nodes = [{ id: 'node_tail' }, { id: 'node_head' }];
    const connections = [{ id: 'edge_1', from: 'node_head', to: 'node_tail' }];

    tracker.start('node_tail', nodes, connections);
    tracker.updateNodeState('node_head', 'failed', 'Network Timeout Error');

    // 模拟容器 DOM
    const fakeContainer = {
        classList: {
            remove: () => {},
            add: () => {}
        },
        innerHTML: '',
        querySelector: () => null
    };

    const panel = new CascadeTrackerPanel({ tracker, statusBus: bus, container: fakeContainer });
    panel.show();

    assert.ok(fakeContainer.innerHTML.includes('node_tail'));
    assert.ok(fakeContainer.innerHTML.includes('node_head'));
    assert.ok(fakeContainer.innerHTML.includes('Network Timeout Error'));
    assert.ok(fakeContainer.innerHTML.includes('停止级联'));
});

test('CascadeTrackerPanel toggle visibility', () => {
    let hidden = true;
    const fakeContainer = {
        classList: {
            remove: (cls) => { if (cls === 'hidden') hidden = false; },
            add: (cls) => { if (cls === 'hidden') hidden = true; }
        },
        innerHTML: '',
        querySelector: () => null
    };

    const panel = new CascadeTrackerPanel({ container: fakeContainer });
    panel.show();
    assert.equal(hidden, false);

    panel.hide();
    assert.equal(hidden, true);
});
