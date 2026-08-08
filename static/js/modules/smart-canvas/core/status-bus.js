/**
 * Smart Canvas Node Run Status Bus (Native ESM)
 * 唯一节点运行态投影源：统一排队/运行/完成/失败及级联轮次序号的写入与订阅。
 * 瞬时态默认不进入画布持久化快照。
 */

export class NodeStatusBus {
    constructor() {
        this._statuses = new Map();
        this._listeners = new Set();
    }

    /**
     * 获取默认状态
     */
    getDefaultStatus(nodeId) {
        return {
            nodeId,
            status: 'idle',
            loopRound: null,
            errorMsg: null,
            updatedAtMs: null,
            meta: {}
        };
    }

    /**
     * 更新指定节点运行状态
     * @param {string} nodeId 
     * @param {Object} statusPatch - { status, loopRound, errorMsg, updatedAtMs, meta }
     */
    setStatus(nodeId, statusPatch = {}) {
        if (!nodeId) return;
        const existing = this._statuses.get(nodeId) || this.getDefaultStatus(nodeId);

        const updated = {
            ...existing,
            ...statusPatch,
            nodeId,
            updatedAtMs: statusPatch.updatedAtMs || Date.now()
        };

        this._statuses.set(nodeId, updated);
        this._notify(nodeId, updated);
        return updated;
    }

    /**
     * 获取指定节点状态
     */
    getStatus(nodeId) {
        if (!nodeId) return this.getDefaultStatus('');
        return this._statuses.get(nodeId) || this.getDefaultStatus(nodeId);
    }

    /**
     * 重置指定节点为 idle
     */
    resetNode(nodeId) {
        if (!nodeId) return;
        return this.setStatus(nodeId, {
            status: 'idle',
            loopRound: null,
            errorMsg: null
        });
    }

    /**
     * 清除所有节点的瞬时运行态 (queued / running) -> 重置为 idle
     */
    clearEphemeral() {
        let changed = false;
        for (const [nodeId, current] of this._statuses.entries()) {
            if (current.status === 'queued' || current.status === 'running') {
                const updated = {
                    ...current,
                    status: 'idle',
                    loopRound: null,
                    updatedAtMs: Date.now()
                };
                this._statuses.set(nodeId, updated);
                this._notify(nodeId, updated);
                changed = true;
            }
        }
        return changed;
    }

    /**
     * 导出完整运行态快照（不含监听器）
     */
    snapshot() {
        const result = {};
        for (const [nodeId, item] of this._statuses.entries()) {
            result[nodeId] = { ...item };
        }
        return result;
    }

    /**
     * 订阅状态变更
     * @param {Function} listener - (nodeId, updatedStatus, allSnapshots) => void
     * @returns {Function} unsubscribe
     */
    subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }

    /**
     * 清空所有状态
     */
    resetAll() {
        this._statuses.clear();
        this._notify('*', null);
    }

    _notify(nodeId, status) {
        const snap = this.snapshot();
        for (const listener of this._listeners) {
            try {
                listener(nodeId, status, snap);
            } catch (e) {
                console.error('[NodeStatusBus] Listener error:', e);
            }
        }
    }
}

export const globalNodeStatusBus = new NodeStatusBus();

if (typeof window !== 'undefined') {
    window.NodeStatusBus = NodeStatusBus;
    window.nodeStatusBus = globalNodeStatusBus;
    window.globalNodeStatusBus = globalNodeStatusBus;
}
