/**
 * MiniMax H3 Node Renderer for Smart Canvas
 * Single responsibility: render MiniMax timeline & segment control.
 */

import { nodeFactory } from './node-factory.js';

export const MINIMAX_NODE_TYPE = 'smart-minimax';

export function renderMiniMaxNode(node) {
    const body = document.createElement('div');
    body.className = 'minimax-workbench';
    const duration = node.duration || 8;
    const aspect = node.aspectRatio || '16:9';
    body.innerHTML = `
        <div class="minimax-head-bar">
            <span class="minimax-badge">MiniMax H3</span>
            <span class="minimax-meta">${aspect} · ${duration}s</span>
        </div>
        <div class="minimax-timeline-lane">
            <div class="minimax-segment">视频生成片段 (${duration}s)</div>
        </div>
    `;
    return body;
}

nodeFactory.registerRenderer(MINIMAX_NODE_TYPE, renderMiniMaxNode);
