/**
 * Legacy Frontend Asset V2 Bridge 控制器 (Native ESM)
 * 对接 /api/v2/assets 接口：版本列表、标签/Collection 筛选、回收站/恢复及拖入画布带 AssetVersion 稳定引用。
 */

import { v2ApiClient } from './v2-api-client.js';

export class AssetV2BridgeController {
    constructor(options = {}) {
        this.apiClient = options.apiClient || v2ApiClient;
        this.legacyStorageKey = options.legacyStorageKey || 'infinite_canvas_legacy_assets';
        this.storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    }

    /**
     * 获取资产列表（支持 tag, collection, asset_type, search 筛选）
     */
    async listAssets(query = {}) {
        try {
            const resp = await this.apiClient.assets.listAssets(query);
            return {
                items: resp.items || resp.data || [],
                total: resp.total || 0,
                page: resp.page || 1
            };
        } catch (err) {
            console.warn('[AssetV2Bridge] 获取 V2 资产列表失败，尝试只读回退:', err);
            return {
                items: this.loadLegacyAssets(),
                total: 0,
                page: 1,
                isLegacyFallback: true
            };
        }
    }

    /**
     * 获取资产的所有版本列表
     */
    async getAssetVersions(assetId) {
        if (!assetId) throw new Error('Asset ID is required');
        try {
            const resp = await this.apiClient.assets.getAssetVersions(assetId);
            if (Array.isArray(resp)) return resp;
            return resp.items || resp.versions || resp.data || [];
        } catch (err) {
            console.warn(`[AssetV2Bridge] 获取 Asset ${assetId} 版本列表失败:`, err);
            return [];
        }
    }

    /**
     * 上传/入库新资产
     */
    async ingestAsset(fileOrFormData, meta = {}) {
        let formData;
        if (typeof FormData !== 'undefined' && fileOrFormData instanceof FormData) {
            formData = fileOrFormData;
        } else {
            formData = new FormData();
            formData.append('file', fileOrFormData);
            if (meta.title) formData.append('title', meta.title);
            if (meta.asset_type) formData.append('asset_type', meta.asset_type);
            if (meta.tags) formData.append('tags', Array.isArray(meta.tags) ? meta.tags.join(',') : meta.tags);
        }

        const result = await this.apiClient.assets.ingestAsset(formData);
        return result;
    }

    /**
     * 移动资产至回收站
     */
    async trashAsset(assetId) {
        if (!assetId) throw new Error('Asset ID is required');
        return await this.apiClient.assets.trashAsset(assetId);
    }

    /**
     * 从回收站恢复资产
     */
    async restoreAsset(assetId) {
        if (!assetId) throw new Error('Asset ID is required');
        return await this.apiClient.assets.restoreAsset(assetId);
    }

    /**
     * 获取回收站列表
     */
    async listTrash(query = {}) {
        try {
            const resp = await this.apiClient.assets.listTrash(query);
            return resp.items || resp.data || [];
        } catch (err) {
            console.warn('[AssetV2Bridge] 获取回收站列表失败:', err);
            return [];
        }
    }

    /**
     * 拖入画布构造节点引用对象（强持 asset_version_id 稳定引用）
     */
    createCanvasNodeRef(asset, selectedVersionId = null) {
        if (!asset) throw new Error('Asset is required');

        const versionId = selectedVersionId || asset.latest_version_id || asset.version_id || `ver_${asset.id}`;
        const assetType = asset.asset_type || asset.type || 'image';

        return {
            type: assetType === 'video' ? 'smart-video' : 'smart-image',
            title: asset.title || asset.filename || 'Asset Node',
            asset_id: asset.id,
            asset_version_id: versionId,
            url: asset.file_url || asset.url || '',
            thumbnail_url: asset.thumbnail_url || asset.file_url || '',
            config: {
                asset_id: asset.id,
                asset_version_id: versionId
            }
        };
    }

    /**
     * 只读加载 Legacy asset_library.json 本地缓存
     */
    loadLegacyAssets() {
        if (!this.storage) return [];
        try {
            const raw = this.storage.getItem(this.legacyStorageKey);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }
}

export const assetV2BridgeController = new AssetV2BridgeController();

if (typeof window !== 'undefined') {
    window.assetV2BridgeController = assetV2BridgeController;
    window.AssetV2BridgeController = AssetV2BridgeController;
}
