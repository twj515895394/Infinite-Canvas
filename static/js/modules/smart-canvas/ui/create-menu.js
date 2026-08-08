/**
 * Smart Canvas Creation Menu Controller
 * Handles double-click creation menu choices (group, prompt, loop, minimax, smart-agent-task, image).
 */

export class CreateMenuController {
    constructor(options = {}) {
        this.menuEl = options.menuEl || document.getElementById('createMenu');
        this.currentPoint = { x: 0, y: 0 };
        this.currentGroupId = '';
    }

    open(point, options = {}) {
        if (!this.menuEl) return;
        this.currentPoint = point || { x: 0, y: 0 };
        this.currentGroupId = options.groupId || '';
        const w = 500;
        const h = 222;
        const left = Math.max(14, Math.min(window.innerWidth - w - 14, point.screenX || 100));
        const top = Math.max(14, Math.min(window.innerHeight - h - 14, point.screenY || 100));
        this.menuEl.style.left = `${left}px`;
        this.menuEl.style.top = `${top}px`;
        this.menuEl.classList.add('open');
    }

    close() {
        if (this.menuEl) {
            this.menuEl.classList.remove('open');
            this.currentGroupId = '';
        }
    }

    /**
     * Map data-create-type string to factory creation parameters.
     */
    resolveNodeType(typeStr) {
        const type = String(typeStr || '').toLowerCase().trim();
        if (type === 'group' || type === 'smart-group') return 'smart-group';
        if (type === 'prompt' || type === 'smart-prompt') return 'smart-prompt';
        if (type === 'loop' || type === 'smart-loop') return 'smart-loop';
        if (type === 'minimax' || type === 'smart-minimax') return 'smart-minimax';
        if (type === 'smart-agent-task' || type === 'agent-task' || type === 'task') return 'smart-agent-task';
        return 'smart-image';
    }
}

export const createMenuController = new CreateMenuController();
