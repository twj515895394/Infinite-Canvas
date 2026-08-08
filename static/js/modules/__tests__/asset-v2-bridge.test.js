import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetV2BridgeController } from '../asset-v2-bridge.js';

function createMockApiClient() {
    const assets = [
        { id: 'ast_01', title: 'Banner Image', asset_type: 'image', latest_version_id: 'ver_01_v2' },
        { id: 'ast_02', title: 'Promo Video', asset_type: 'video', latest_version_id: 'ver_02_v1' }
    ];
    const trashed = [];

    return {
        assets: {
            listAssets: async () => ({ items: assets, total: 2, page: 1 }),
            getAssetVersions: async (id) => ([{ id: `ver_${id}_v1` }, { id: `ver_${id}_v2` }]),
            ingestAsset: async (fd) => ({ id: 'ast_new', title: 'Uploaded' }),
            trashAsset: async (id) => {
                const idx = assets.findIndex(a => a.id === id);
                if (idx !== -1) {
                    trashed.push(assets[idx]);
                    assets.splice(idx, 1);
                }
                return { success: true };
            },
            restoreAsset: async (id) => {
                const idx = trashed.findIndex(a => a.id === id);
                if (idx !== -1) {
                    assets.push(trashed[idx]);
                    trashed.splice(idx, 1);
                }
                return { success: true };
            },
            listTrash: async () => ({ items: trashed })
        }
    };
}

test('AssetV2BridgeController lists assets from V2 API', async () => {
    const mockClient = createMockApiClient();
    const bridge = new AssetV2BridgeController({ apiClient: mockClient });

    const result = await bridge.listAssets();
    assert.equal(result.items.length, 2);
    assert.equal(result.total, 2);
});

test('AssetV2BridgeController retrieves asset versions', async () => {
    const mockClient = createMockApiClient();
    const bridge = new AssetV2BridgeController({ apiClient: mockClient });

    const versions = await bridge.getAssetVersions('ast_01');
    assert.equal(versions.length, 2);
    assert.equal(versions[0].id, 'ver_ast_01_v1');
});

test('AssetV2BridgeController handles trash and restore lifecycle', async () => {
    const mockClient = createMockApiClient();
    const bridge = new AssetV2BridgeController({ apiClient: mockClient });

    await bridge.trashAsset('ast_01');
    const trashedList = await bridge.listTrash();
    assert.equal(trashedList.length, 1);
    assert.equal(trashedList[0].id, 'ast_01');

    await bridge.restoreAsset('ast_01');
    const restoredAssets = await bridge.listAssets();
    assert.equal(restoredAssets.items.length, 2);
});

test('AssetV2BridgeController constructs canvas node ref carrying asset_version_id', () => {
    const bridge = new AssetV2BridgeController();
    const asset = {
        id: 'ast_100',
        title: 'Hero Graphic',
        asset_type: 'image',
        latest_version_id: 'ver_100_v3',
        file_url: '/storage/assets/hero.png'
    };

    const nodeRef = bridge.createCanvasNodeRef(asset);
    assert.equal(nodeRef.type, 'smart-image');
    assert.equal(nodeRef.asset_id, 'ast_100');
    assert.equal(nodeRef.asset_version_id, 'ver_100_v3');
    assert.equal(nodeRef.config.asset_version_id, 'ver_100_v3');
});
