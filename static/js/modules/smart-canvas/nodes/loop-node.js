/**
 * Loop Node Module for Smart Canvas
 * Single responsibility: render and manage loop nodes.
 */

import { nodeFactory } from './node-factory.js';

export const LOOP_NODE_TYPE = 'smart-loop';

export function renderLoopNode(node) {
    const body = document.createElement('div');
    body.className = 'loop-editor';
    body.innerHTML = `
        <div class="loop-info">
            <span class="loop-title">循环任务 (${node.count || 1}次)</span>
        </div>
    `;
    return body;
}

nodeFactory.registerRenderer(LOOP_NODE_TYPE, renderLoopNode);
