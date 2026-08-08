/**
 * RAF (requestAnimationFrame) 驱动的画布平移与缩放渲染引擎
 * 用于解决高频 mousemove/wheel 事件导致的拖拽与缩放丢帧卡顿
 */
import { globalEventBus } from '../core/event-bus.js';

export class ViewTransformEngine {
    constructor(options = {}) {
        this.worldEl = options.worldEl || null;
        this.shellEl = options.shellEl || null;
        
        this.viewport = {
            x: options.x || 0,
            y: options.y || 0,
            scale: options.scale || 1
        };

        this.minScale = options.minScale || 0.05;
        this.maxScale = options.maxScale || 5.0;

        this.rafId = null;
        this.isDirty = false;
        
        // 绑定回调
        this.onViewportChange = options.onViewportChange || null;
    }

    /**
     * 绑定 DOM 容器元素并开启 GPU 硬件加速提示
     */
    attach(worldEl, shellEl) {
        this.worldEl = worldEl;
        this.shellEl = shellEl;

        if (this.worldEl) {
            // 启用 CSS 3D 硬件加速
            this.worldEl.style.willChange = 'transform';
            this.worldEl.style.transformOrigin = '0 0';
        }
    }

    /**
     * 设置当前 Viewport
     */
    setViewport(x, y, scale, immediate = false) {
        this.viewport.x = Number.isFinite(x) ? x : this.viewport.x;
        this.viewport.y = Number.isFinite(y) ? y : this.viewport.y;
        if (Number.isFinite(scale) && scale > 0) {
            this.viewport.scale = Math.max(this.minScale, Math.min(this.maxScale, scale));
        }

        if (immediate) {
            this.flush();
        } else {
            this.requestRender();
        }
    }

    /**
     * 平移相对增量 (dx, dy)
     */
    panBy(dx, dy) {
        this.viewport.x += dx;
        this.viewport.y += dy;
        this.requestRender();
    }

    /**
     * 以焦点 (cx, cy) 为中心进行安全缩放
     */
    zoomAt(cx, cy, factor) {
        const prevScale = this.viewport.scale;
        const nextScale = Math.max(this.minScale, Math.min(this.maxScale, prevScale * factor));
        if (Math.abs(nextScale - prevScale) < 0.0001) return;

        // 计算保持鼠标点不动时的增量偏移
        const scaleRatio = nextScale / prevScale;
        this.viewport.x = cx - (cx - this.viewport.x) * scaleRatio;
        this.viewport.y = cy - (cy - this.viewport.y) * scaleRatio;
        this.viewport.scale = nextScale;

        this.requestRender();
    }

    /**
     * 请求下一次 RAF 刷新（防抖锁帧）
     */
    requestRender() {
        this.isDirty = true;
        if (!this.rafId) {
            const reqFn = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (cb => setTimeout(cb, 16));
            this.rafId = reqFn(() => this.flush());
        }
    }

    /**
     * 执行实际的 DOM 刷新
     */
    flush() {
        this.rafId = null;
        if (!this.isDirty || !this.worldEl) return;

        const { x, y, scale } = this.viewport;
        // 采用 3D translate3d 触发 GPU 合成层，避免 CPU 布局重排
        this.worldEl.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0px) scale(${scale.toFixed(4)})`;

        // 缩放控制 class（防止放大缩小后文字发虚）
        this.worldEl.classList.toggle('canvas-scaled', Math.abs(scale - 1) > 0.001);

        this.isDirty = false;

        // 发送事件广播
        globalEventBus.emit('viewport:change', { ...this.viewport });

        if (typeof this.onViewportChange === 'function') {
            this.onViewportChange({ ...this.viewport });
        }
    }

    /**
     * 屏幕坐标转画布世界坐标
     */
    screenToWorld(clientX, clientY) {
        if (!this.shellEl) return { x: 0, y: 0 };
        const rect = this.shellEl.getBoundingClientRect();
        return {
            x: (clientX - rect.left - this.viewport.x) / this.viewport.scale,
            y: (clientY - rect.top - this.viewport.y) / this.viewport.scale
        };
    }

    /**
     * 画布世界坐标转屏幕坐标
     */
    worldToScreen(worldX, worldY) {
        if (!this.shellEl) return { x: 0, y: 0 };
        const rect = this.shellEl.getBoundingClientRect();
        return {
            x: worldX * this.viewport.scale + this.viewport.x + rect.left,
            y: worldY * this.viewport.scale + this.viewport.y + rect.top
        };
    }
}

// 导出单例引擎
export const viewTransformEngine = new ViewTransformEngine();
