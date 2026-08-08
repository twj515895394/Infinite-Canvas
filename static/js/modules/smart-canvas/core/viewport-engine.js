/**
 * Smart Canvas Viewport Engine
 * Handles canvas pan, zoom, screen-to-world, world-to-screen coordinate math.
 */

export class ViewportEngine {
    constructor() {
        this.viewport = { x: 0, y: 0, zoom: 1 };
        this.minZoom = 0.1;
        this.maxZoom = 4.0;
    }

    screenToWorld(screenX, screenY, containerRect = { left: 0, top: 0 }) {
        const cx = screenX - containerRect.left;
        const cy = screenY - containerRect.top;
        return {
            x: (cx - this.viewport.x) / this.viewport.zoom,
            y: (cy - this.viewport.y) / this.viewport.zoom
        };
    }

    worldToScreen(worldX, worldY, containerRect = { left: 0, top: 0 }) {
        return {
            x: worldX * this.viewport.zoom + this.viewport.x + containerRect.left,
            y: worldY * this.viewport.zoom + this.viewport.y + containerRect.top
        };
    }

    setZoom(zoom, centerScreenX = 0, centerScreenY = 0, containerRect = { left: 0, top: 0 }) {
        const nextZoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
        if (nextZoom === this.viewport.zoom) return;

        const worldBefore = this.screenToWorld(centerScreenX, centerScreenY, containerRect);
        this.viewport.zoom = nextZoom;
        const screenAfter = this.worldToScreen(worldBefore.x, worldBefore.y, containerRect);

        this.viewport.x += centerScreenX - screenAfter.x;
        this.viewport.y += centerScreenY - screenAfter.y;
    }

    panBy(dx, dy) {
        this.viewport.x += dx;
        this.viewport.y += dy;
    }

    reset() {
        this.viewport = { x: 0, y: 0, zoom: 1 };
    }
}

export const viewportEngine = new ViewportEngine();
