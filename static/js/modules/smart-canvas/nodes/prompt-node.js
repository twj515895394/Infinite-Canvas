/**
 * Prompt Node Module for Smart Canvas
 * Single responsibility: render and manage prompt text nodes.
 */

import { nodeFactory } from './node-factory.js';

export const PROMPT_NODE_TYPE = 'smart-prompt';

export function renderPromptNode(node) {
    const body = document.createElement('div');
    body.className = 'prompt-editor';
    const text = node.text || '';
    body.innerHTML = `
        <div class="prompt-toolbar">
            <button class="prompt-template-btn" type="button" data-prompt-template-open data-prompt-template-node-id="${node.id}">
                <span>模板</span>
            </button>
        </div>
        <textarea placeholder="输入提示词...">${text}</textarea>
    `;
    return body;
}

nodeFactory.registerRenderer(PROMPT_NODE_TYPE, renderPromptNode);
