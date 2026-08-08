import test from 'node:test';
import assert from 'node:assert/strict';
import { ChainPresetHub } from '../chain-preset-hub.js';
import { PromptTemplateHub } from '../prompt-template-hub.js';

function createMockCanvasStateStore() {
    let nodes = [{ id: 'existing_01', type: 'smart-image', x: 0, y: 0 }];
    let edges = [];

    return {
        addNode: (node) => nodes.push(node),
        addEdge: (edge) => edges.push(edge),
        getSnapshot: () => ({ nodes: [...nodes], edges: [...edges] }),
        restoreSnapshot: (snap) => {
            nodes = [...snap.nodes];
            edges = [...snap.edges];
        },
        getNodes: () => nodes,
        getEdges: () => edges
    };
}

test('ChainPresetHub lists default system presets', () => {
    const hub = new ChainPresetHub();
    const presets = hub.getAllPresets();
    assert.ok(presets.length >= 2);
    assert.ok(presets.some(p => p.id === 'chain_text_to_image_enhancer'));
});

test('ChainPresetHub previews chain preset structural diff', () => {
    const hub = new ChainPresetHub();
    const preview = hub.previewChainPreset('chain_text_to_image_enhancer', { x: 50, y: 50 });

    assert.equal(preview.nodeCount, 3);
    assert.equal(preview.edgeCount, 2);
    assert.equal(preview.previewNodes[0].position.x, 50);
    assert.equal(preview.previewNodes[1].position.x, 310);
});

test('ChainPresetHub applies preset non-destructively and restores on undo', () => {
    const hub = new ChainPresetHub();
    const mockStore = createMockCanvasStateStore();

    assert.equal(mockStore.getNodes().length, 1);

    const result = hub.applyChainPreset('chain_text_to_image_enhancer', mockStore);
    assert.equal(result.success, true);
    assert.equal(mockStore.getNodes().length, 4); // 1 existing + 3 new
    assert.equal(mockStore.getEdges().length, 2);
    assert.equal(mockStore.getNodes()[0].id, 'existing_01'); // existing node unchanged

    const undone = hub.undoApplyPreset(mockStore);
    assert.equal(undone, true);
    assert.equal(mockStore.getNodes().length, 1);
});

test('ChainPresetHub supports JSON import and export', () => {
    const hub = new ChainPresetHub();
    const exportedJson = hub.exportPresetAsJson('chain_text_to_image_enhancer');
    assert.ok(typeof exportedJson === 'string');

    const imported = hub.importPresetFromJson(JSON.stringify({
        title: 'Custom Workflow',
        category: 'Custom',
        nodes: [{ tempId: 't1', type: 'prompt-node' }],
        edges: []
    }));

    assert.equal(imported.title, 'Custom Workflow');
    assert.ok(hub.getAllPresets().some(p => p.id === imported.id));
});

test('PromptTemplateHub bridges chain presets and switches tab', () => {
    const hub = new PromptTemplateHub();
    assert.equal(hub.activeTab, 'templates');

    hub.switchTab('chain_presets');
    assert.equal(hub.activeTab, 'chain_presets');

    const presets = hub.getChainPresets();
    assert.ok(presets.length >= 2);
});
