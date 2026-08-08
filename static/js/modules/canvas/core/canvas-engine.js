/**
 * Legacy Canvas Engine (Native ESM Core)
 * 单节点画布平移与缩放引擎：坐标转换、视窗平移与缩放逻辑。
 */

export class CanvasEngine {
    constructor() {
        this.scale = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.startX = 0;
        this.startY = 0;
    }

    screenToWorld(clientX, clientY) {
        const board = document.getElementById('board');
        const rect = board ? board.getBoundingClientRect() : { left: 0, top: 0 };
        return {
            x: (clientX - rect.left - this.panX) / this.scale,
            y: (clientY - rect.top - this.panY) / this.scale
        };
    }

    worldToScreen(worldX, worldY) {
        const board = document.getElementById('board');
        const rect = board ? board.getBoundingClientRect() : { left: 0, top: 0 };
        return {
            x: worldX * this.scale + this.panX + rect.left,
            y: worldY * this.scale + this.panY + rect.top
        };
    }

    applyTransform() {
        const world = document.getElementById('world');
        if (world) {
            world.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
        }
    }

    resetView() {
        this.scale = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.applyTransform();
    }
}

export const canvasEngine = new CanvasEngine();

if (typeof window !== 'undefined') {
    window.CanvasEngine = CanvasEngine;
    window.canvasEngine = canvasEngine;
}
