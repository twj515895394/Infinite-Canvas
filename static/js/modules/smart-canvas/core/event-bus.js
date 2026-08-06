/**
 * 轻量级解耦发布订阅事件总线 (EventBus)
 * 用于模块化 SmartCanvas 各组件之间的低耦合通信
 */
export class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    /**
     * 订阅事件
     * @param {string} event 事件名称
     * @param {Function} callback 回调函数
     * @returns {Function} 解绑函数
     */
    on(event, callback) {
        if (typeof callback !== 'function') {
            console.warn(`[EventBus] Subscriber callback for "${event}" must be a function.`);
            return () => {};
        }

        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }

        this.listeners.get(event).add(callback);

        // 返回主动解绑方法
        return () => this.off(event, callback);
    }

    /**
     * 单次订阅事件
     * @param {string} event 
     * @param {Function} callback 
     */
    once(event, callback) {
        const wrapper = (...args) => {
            this.off(event, wrapper);
            callback.apply(this, args);
        };
        return this.on(event, wrapper);
    }

    /**
     * 取消订阅
     * @param {string} event 
     * @param {Function} callback 
     */
    off(event, callback) {
        if (!this.listeners.has(event)) return;

        if (!callback) {
            this.listeners.delete(event);
        } else {
            const handlers = this.listeners.get(event);
            handlers.delete(callback);
            if (handlers.size === 0) {
                this.listeners.delete(event);
            }
        }
    }

    /**
     * 触发事件
     * @param {string} event 
     * @param  {...any} args 
     */
    emit(event, ...args) {
        if (!this.listeners.has(event)) return;

        const handlers = Array.from(this.listeners.get(event));
        for (const handler of handlers) {
            try {
                handler.apply(this, args);
            } catch (err) {
                console.error(`[EventBus] Error in listener for event "${event}":`, err);
            }
        }
    }

    /**
     * 清空所有监听器
     */
    clear() {
        this.listeners.clear();
    }
}

// 导出全局单例（方便直接 import）
export const globalEventBus = new EventBus();
