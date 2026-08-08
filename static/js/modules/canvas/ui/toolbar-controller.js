/**
 * Legacy Canvas Toolbar Controller (Native ESM UI)
 * 快捷工具栏与新建菜单控制器：管理 #quickToolbar 与 #createMenu
 */

export class ToolbarController {
    constructor() {
        this.quickToolbar = null;
        this.createMenu = null;
    }

    init() {
        if (typeof document === 'undefined') return;
        this.quickToolbar = document.getElementById('quickToolbar');
        this.createMenu = document.getElementById('createMenu');
    }

    toggleQuickToolbar() {
        if (!this.quickToolbar) this.quickToolbar = document.getElementById('quickToolbar');
        if (this.quickToolbar) {
            this.quickToolbar.classList.toggle('collapsed');
        }
    }

    openCreateMenu(x, y) {
        if (!this.createMenu) this.createMenu = document.getElementById('createMenu');
        if (this.createMenu) {
            this.createMenu.style.left = `${x}px`;
            this.createMenu.style.top = `${y}px`;
            this.createMenu.classList.add('open');
        }
    }

    closeCreateMenu() {
        if (!this.createMenu) this.createMenu = document.getElementById('createMenu');
        if (this.createMenu) {
            this.createMenu.classList.remove('open');
        }
    }
}

export const toolbarController = new ToolbarController();

if (typeof window !== 'undefined') {
    window.ToolbarController = ToolbarController;
    window.toolbarController = toolbarController;
    window.toggleQuickToolbar = () => toolbarController.toggleQuickToolbar();
    window.closeCreateMenu = () => toolbarController.closeCreateMenu();
}
