import test from 'node:test';
import assert from 'node:assert/strict';
import { CanvasStateStore } from '../smart-canvas/core/canvas-state.js';
import { ViewTransformEngine } from '../smart-canvas/render/view-transform.js';
import { ConnectionLineRenderer } from '../smart-canvas/render/connection-line.js';
import { NodeFactory } from '../smart-canvas/nodes/node-factory.js';

test('CanvasStateStore getSnapshot and restoreSnapshot operate cleanly', () => {
    const store = new CanvasStateStore();
    store.addNode({ id: 'node_1', type: 'smart-image', x: 10, y: 20 }, false);
    store.setSelected(['node_1']);

    const snapshot = store.getSnapshot();
    assert.equal(snapshot.nodes.length, 1);
    assert.equal(snapshot.selectedIds[0], 'node_1');

    store.removeNode('node_1', false);
    assert.equal(store.getNodes().length, 0);

    store.restoreSnapshot(snapshot);
    assert.equal(store.getNodes().length, 1);
    assert.equal(store.selectedIds.has('node_1'), true);
});

test('ViewTransformEngine manages zoom/pan bounds and transform state', () => {
    const engine = new ViewTransformEngine({ minScale: 0.2, maxScale: 3.0 });
    engine.panBy(50, -30);
    assert.equal(engine.viewport.x, 50);
    assert.equal(engine.viewport.y, -30);

    engine.zoomAt(0, 0, 1.5);
    assert.ok(engine.viewport.scale > 1.0);

    engine.setViewport(0, 0, 1.0, true);
    assert.equal(engine.viewport.scale, 1.0);
    assert.equal(engine.viewport.x, 0);
    assert.equal(engine.viewport.y, 0);
});

test('ConnectionLineRenderer calculates cubic bezier SVG path', () => {
    const renderer = new ConnectionLineRenderer();
    const path = renderer.calculateBezierPath(0, 0, 200, 100);
    assert.ok(path.startsWith('M 0'));
    assert.ok(path.includes('200'));
});

test('NodeFactory registers and cleans up event listeners on node destruction', () => {
    const factory = new NodeFactory();
    let cleanedUp = false;

    const fakeElement = {
        addEventListener: () => {},
        removeEventListener: () => { cleanedUp = true; }
    };

    factory.addEventListenerWithCleanup('node_test', fakeElement, 'click', () => {});
    assert.equal(cleanedUp, false);

    factory.destroyNodeEvents('node_test');
    assert.equal(cleanedUp, true);
});
