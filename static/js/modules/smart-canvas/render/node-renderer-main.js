/**
 * Smart Canvas Main Node Renderer
 * Dispatches node element creation and attaches nodeFactory ESM renderers.
 */

import { nodeFactory } from '../nodes/node-factory.js';

export class NodeRendererMain {
    constructor() {
        this.registeredTypes = new Set();
    }

    renderNodeElement(node, options = {}) {
        if (!node || !node.id) return null;

        const isSelected = Boolean(options.selectedIds && options.selectedIds.includes(node.id));
        const el = document.createElement('div');
        el.className = `node ${node.type || 'smart'}-node ${isSelected ? 'selected' : ''}`;
        el.style.left = `${node.x || 0}px`;
        el.style.top = `${node.y || 0}px`;
        if (node.w) el.style.width = `${node.w}px`;
        if (node.h) el.style.height = `${node.h}px`;
        el.dataset.id = node.id;

        // Header
        const head = document.createElement('div');
        head.className = 'node-head';
        head.innerHTML = `<span class="node-title">${node.title || node.type || 'Node'}</span>`;
        el.appendChild(head);

        // Body via NodeFactory ESM delegate if registered
        const body = document.createElement('div');
        body.className = 'node-body';

        const customRenderer = nodeFactory.renderers.get(node.type);
        if (customRenderer) {
            const customContent = customRenderer(node);
            if (customContent) body.appendChild(customContent);
        } else {
            body.innerHTML = `<div class="default-node-content">${node.title || 'Canvas Node'}</div>`;
        }

        el.appendChild(body);
        return el;
    }
}

export const nodeRendererMain = new NodeRendererMain();
