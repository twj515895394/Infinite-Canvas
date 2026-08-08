/**
 * Smart Canvas Asset Library Panel Controller
 * Handles asset library display, local asset management, and drag-and-drop.
 */

export class AssetLibraryPanelController {
    constructor(options = {}) {
        this.assetPanel = options.assetPanel || document.getElementById('assetPanel');
        this.assetGrid = options.assetGrid || document.getElementById('assetGrid');
        this.activeCategory = '';
        this.items = [];
    }

    isOpen() {
        return Boolean(this.assetPanel && this.assetPanel.classList.contains('open'));
    }

    toggle(openState) {
        if (!this.assetPanel) return;
        const target = typeof openState === 'boolean' ? openState : !this.isOpen();
        this.assetPanel.classList.toggle('open', target);
    }

    setItems(items = []) {
        this.items = Array.isArray(items) ? items : [];
    }

    renderItems() {
        if (!this.assetGrid) return;
        if (!this.items.length) {
            this.assetGrid.innerHTML = `<div class="asset-empty">暂无素材，可拖入图片追加</div>`;
            return;
        }
        this.assetGrid.innerHTML = this.items.map(item => `
            <div class="asset-item" data-asset-id="${item.id || ''}" data-url="${item.url || ''}">
                <img src="${item.url || ''}" loading="lazy" alt="${item.name || 'asset'}" />
                <span class="asset-name" title="${item.name || ''}">${item.name || 'asset'}</span>
            </div>
        `).join('');
    }
}

export const assetLibraryPanelController = new AssetLibraryPanelController();
