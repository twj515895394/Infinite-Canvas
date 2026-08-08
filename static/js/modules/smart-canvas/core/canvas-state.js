/**
 * 集中式 CanvasState 画布状态管理器
 * 解耦数据状态与 DOM 视图渲染，支持受控单向数据更新与 Undo/Redo 历史栈
 */
import { globalEventBus } from './event-bus.js';

export class CanvasStateStore {
    constructor() {
        this.nodesMap = new Map();
        this.connections = [];
        this.selectedIds = new Set();
        
        // 历史栈
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistorySize = 50;

        // 避免历史记录无限循环触发
        this.isBatchUpdating = false;
    }

    /**
     * 重置/初始化全量节点与连线数据
     */
    setCanvasData(nodes = [], connections = []) {
        this.nodesMap.clear();
        (nodes || []).forEach(node => {
            if (node && node.id) {
                this.nodesMap.set(node.id, { ...node });
            }
        });
        this.connections = Array.isArray(connections) ? [...connections] : [];
        this.selectedIds.clear();
        
        this.notify('canvas:load', { nodes: this.getNodes(), connections: this.connections });
    }

    /**
     * 获取所有节点的数组形式
     */
    getNodes() {
        return Array.from(this.nodesMap.values());
    }

    /**
     * 根据 ID 获取节点
     */
    getNode(id) {
        return this.nodesMap.get(id) || null;
    }

    /**
     * 添加单个节点
     */
    addNode(node, recordUndo = true) {
        if (!node || !node.id) return;
        if (recordUndo) this.pushUndo();

        this.nodesMap.set(node.id, { ...node });
        this.notify('node:add', { node });
    }

    /**
     * 更新节点指定属性
     */
    updateNode(id, patch, recordUndo = false) {
        const existing = this.nodesMap.get(id);
        if (!existing) return;

        if (recordUndo) this.pushUndo();

        const updated = { ...existing, ...patch };
        this.nodesMap.set(id, updated);
        this.notify('node:update', { node: updated, patch });
    }

    /**
     * 删除节点及相关关联连线
     */
    removeNode(id, recordUndo = true) {
        if (!this.nodesMap.has(id)) return;
        if (recordUndo) this.pushUndo();

        const removed = this.nodesMap.get(id);
        this.nodesMap.delete(id);
        this.selectedIds.delete(id);

        // 清理关联连线
        this.connections = this.connections.filter(c => c.from !== id && c.to !== id);

        this.notify('node:remove', { id, node: removed });
    }

    /**
     * 设置选中节点集合
     */
    setSelected(ids = []) {
        this.selectedIds = new Set(ids);
        this.notify('selection:change', { selectedIds: Array.from(this.selectedIds) });
    }

    /**
     * 压入撤销历史帧
     */
    pushUndo() {
        if (this.isBatchUpdating) return;

        const snapshot = {
            nodes: this.getNodes().map(n => JSON.parse(JSON.stringify(n))),
            connections: JSON.parse(JSON.stringify(this.connections))
        };

        this.undoStack.push(snapshot);
        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }
        // 产生新操作时清空 redo 栈
        this.redoStack = [];

        this.notify('history:change', { canUndo: this.canUndo(), canRedo: this.canRedo() });
    }

    /**
     * 撤销 (Undo)
     */
    undo() {
        if (!this.canUndo()) return false;

        const currentSnapshot = {
            nodes: this.getNodes().map(n => JSON.parse(JSON.stringify(n))),
            connections: JSON.parse(JSON.stringify(this.connections))
        };
        this.redoStack.push(currentSnapshot);

        const previousSnapshot = this.undoStack.pop();
        this.applySnapshot(previousSnapshot);

        this.notify('history:undo', { snapshot: previousSnapshot });
        return true;
    }

    /**
     * 恢复 (Redo)
     */
    redo() {
        if (!this.canRedo()) return false;

        const currentSnapshot = {
            nodes: this.getNodes().map(n => JSON.parse(JSON.stringify(n))),
            connections: JSON.parse(JSON.stringify(this.connections))
        };
        this.undoStack.push(currentSnapshot);

        const nextSnapshot = this.redoStack.pop();
        this.applySnapshot(nextSnapshot);

        this.notify('history:redo', { snapshot: nextSnapshot });
        return true;
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    applySnapshot(snapshot) {
        if (!snapshot) return;
        this.isBatchUpdating = true;

        this.nodesMap.clear();
        (snapshot.nodes || []).forEach(node => this.nodesMap.set(node.id, { ...node }));
        this.connections = Array.isArray(snapshot.connections) ? [...snapshot.connections] : [];

        this.isBatchUpdating = false;
        this.notify('state:change', { nodes: this.getNodes(), connections: this.connections });
    }

    getSnapshot() {
        return {
            nodes: this.getNodes().map(n => JSON.parse(JSON.stringify(n))),
            connections: JSON.parse(JSON.stringify(this.connections)),
            selectedIds: Array.from(this.selectedIds)
        };
    }

    restoreSnapshot(snapshot) {
        if (!snapshot) return;
        this.applySnapshot(snapshot);
        if (Array.isArray(snapshot.selectedIds)) {
            this.setSelected(snapshot.selectedIds);
        }
    }

    notify(eventName, payload) {
        globalEventBus.emit(eventName, payload);
        globalEventBus.emit('state:any', { eventName, payload });
    }
}

// 导出全局单例
export const canvasStateStore = new CanvasStateStore();
