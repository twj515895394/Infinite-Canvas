/**
 * NodeFactory 节点工厂与 DOM 生命周期管理器
 * 提供集中式的节点 DOM 渲染与事件解绑回收机制
 */
export class NodeFactory {
    constructor() {
        this.nodeRenderers = new Map();
        this.nodeEventListeners = new Map(); // nodeId -> CleanupFunctions[]
    }

    /**
     * 注册指定 node.type 的 DOM 渲染器
     */
    registerRenderer(type, renderFunc) {
        if (typeof renderFunc === 'function') {
            this.nodeRenderers.set(type, renderFunc);
        }
    }

    /**
     * 为指定节点添加可自动回收的事件监听器
     */
    addEventListenerWithCleanup(nodeId, element, eventName, handler, options) {
        if (!element || typeof handler !== 'function') return;

        element.addEventListener(eventName, handler, options);

        if (!this.nodeEventListeners.has(nodeId)) {
            this.nodeEventListeners.set(nodeId, []);
        }

        const cleanup = () => {
            try {
                element.removeEventListener(eventName, handler, options);
            } catch (err) {
                // ignore if element is detached
            }
        };

        this.nodeEventListeners.get(nodeId).push(cleanup);
        return cleanup;
    }

    /**
     * 渲染指定节点并返回其 DOM 节点
     */
    renderNode(node) {
        if (!node || !node.id) return null;

        const type = node.type || 'smart-image';
        const renderer = this.nodeRenderers.get(type) || this.defaultRenderer;

        // 在重新渲染节点前先清理其旧的事件绑定
        this.destroyNodeEvents(node.id);

        const nodeEl = renderer.call(this, node);
        if (nodeEl) {
            nodeEl.setAttribute('data-node-id', node.id);
            nodeEl.setAttribute('data-node-type', type);
        }
        return nodeEl;
    }

    /**
     * 默认节点渲染回退
     */
    defaultRenderer(node) {
        const div = document.createElement('div');
        div.className = 'smart-node smart-generic-node';
        div.id = `node-${node.id}`;
        div.innerHTML = `<div class="smart-node-head"><span class="smart-node-title">${node.title || node.type || 'Node'}</span></div>`;
        return div;
    }

    /**
     * 销毁节点的事件监听并释放资源
     */
    destroyNodeEvents(nodeId) {
        if (!this.nodeEventListeners.has(nodeId)) return;

        const cleanups = this.nodeEventListeners.get(nodeId) || [];
        for (const cleanup of cleanups) {
            try {
                cleanup();
            } catch (e) {}
        }
        this.nodeEventListeners.delete(nodeId);
    }
}

// 导出全局节点工厂单例
export const nodeFactory = new NodeFactory();
