/**
 * Smart Canvas Application Lifecycle Engine
 * Handles initialization, loading canvas state, and render loops.
 */

import { canvasAPIService } from '../api/canvas-api.js';
import { canvasStateStore } from './canvas-state.js';
import { historyManager } from './history.js';
import { nodeRendererMain } from '../render/node-renderer-main.js';
import { composerPanelController } from '../ui/composer-panel.js';
import { createMenuController } from '../ui/create-menu.js';

export class CanvasApp {
    constructor() {
        this.canvasId = '';
        this.worldEl = null;
        this.shellEl = null;
        this.initialized = false;
    }

    async init(canvasId, options = {}) {
        this.canvasId = canvasId;
        this.worldEl = options.worldEl || document.getElementById('world');
        this.shellEl = options.shellEl || document.getElementById('canvasShell');
        this.initialized = true;

        if (this.canvasId) {
            await this.loadCanvas(this.canvasId);
        }
    }

    async loadCanvas(canvasId) {
        try {
            const data = await canvasAPIService.fetchCanvas(canvasId);
            if (data && data.canvas) {
                canvasStateStore.setNodes(data.canvas.nodes || []);
                canvasStateStore.setConnections(data.canvas.connections || []);
                this.render();
            }
        } catch (err) {
            console.error('[CanvasApp] Failed to load canvas:', err);
        }
    }

    render() {
        if (!this.worldEl) return;
        const nodes = canvasStateStore.getNodes();
        const selectedId = canvasStateStore.getSelectedId();

        // Clear existing node DOMs except static layers
        const nodeEls = this.worldEl.querySelectorAll('.node');
        nodeEls.forEach(el => el.remove());

        // Render each node via nodeRendererMain
        nodes.forEach(node => {
            const el = nodeRendererMain.renderNodeElement(node, {
                selectedIds: selectedId ? [selectedId] : []
            });
            if (el) this.worldEl.appendChild(el);
        });

        // Update composer visibility for selected node
        const activeNode = canvasStateStore.getSelectedNode();
        composerPanelController.updateComposer(activeNode);
    }
}

export const canvasApp = new CanvasApp();
