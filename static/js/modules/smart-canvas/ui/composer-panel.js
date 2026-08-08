/**
 * Smart Canvas Floating Composer Panel Controller
 * Handles floating prompt/engine composer bar (#composer) and ensures
 * non-runnable or agent-task nodes hide image generation controls.
 */

export class ComposerPanelController {
    constructor(options = {}) {
        this.composerEl = options.composerEl || document.getElementById('composer');
        this.cascadeRunBtn = options.cascadeRunBtn || document.getElementById('cascadeRunBtn');
        this.promptInput = options.promptInput || document.getElementById('promptInput');
        this.engineSelect = options.engineSelect || document.getElementById('engineSelect');
        this.activeSubject = null;
        this.lastNodeKey = '';
    }

    /**
     * Check if a node should hide the image generation composer panel.
     */
    shouldHideComposer(node) {
        if (!node) return true;
        // Agent task nodes and MiniMax nodes do not use the image generation floating bar
        if (node.type === 'smart-agent-task' || node.type === 'smart-minimax') {
            return true;
        }
        return false;
    }

    /**
     * Update composer panel visibility and position based on current selected node.
     */
    updateComposer(selectedNode, isRunnableCallback = null) {
        if (!this.composerEl) return;

        if (this.shouldHideComposer(selectedNode)) {
            this.composerEl.classList.remove('open');
            if (this.cascadeRunBtn) this.cascadeRunBtn.style.display = 'none';
            this.activeSubject = null;
            this.lastNodeKey = '';
            return;
        }

        const isRunnable = typeof isRunnableCallback === 'function' 
            ? isRunnableCallback(selectedNode) 
            : Boolean(selectedNode && selectedNode.type !== 'smart-agent-task');

        if (!isRunnable) {
            if (this.cascadeRunBtn) this.cascadeRunBtn.style.display = 'none';
            this.composerEl.classList.remove('open');
            this.activeSubject = null;
            this.lastNodeKey = '';
            return;
        }

        this.composerEl.classList.toggle('open', Boolean(selectedNode));
    }

    /**
     * Position the composer bar centered under a given node's bounding rectangle.
     */
    positionForNode(rect, gap = 14, cardW = 540) {
        if (!this.composerEl || !rect) return;
        this.composerEl.style.width = `${cardW}px`;
        this.composerEl.style.left = `${rect.x + rect.width / 2 - cardW / 2}px`;
        this.composerEl.style.top = `${rect.y + rect.height + gap}px`;
    }
}

export const composerPanelController = new ComposerPanelController();
