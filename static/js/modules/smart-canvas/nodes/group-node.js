/**
 * Smart Group Node Renderer for Smart Canvas
 * Single responsibility: render group containers and thumbnail grids.
 */

import { nodeFactory } from './node-factory.js';

export const GROUP_NODE_TYPE = 'smart-group';

export function renderGroupNode(node) {
    const body = document.createElement('div');
    body.className = 'smart-group-body';
    const title = node.title || '智能分组';
    const items = Array.isArray(node.items) ? node.items : [];
    body.innerHTML = `
        <div class="group-header">
            <span class="group-title">${title}</span>
            <span class="group-count">${items.length} 项</span>
        </div>
    `;
    return body;
}

nodeFactory.registerRenderer(GROUP_NODE_TYPE, renderGroupNode);
