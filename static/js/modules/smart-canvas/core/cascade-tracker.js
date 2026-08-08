/**
 * Smart Canvas Cascade Tracker Logic (Native ESM)
 * 从 Smart Canvas 抽出级联图构建、轮次调度、停止标志、并发上限、边与节点状态投影等核心逻辑。
 */

export class CascadeTracker {
    constructor(options = {}) {
        this.statusBus = options.statusBus || null;
        this.defaultMaxConcurrency = options.defaultMaxConcurrency || 4;
        this.comfyMaxConcurrency = options.comfyMaxConcurrency || 1;

        this._resetState();
    }

    _resetState() {
        this._runId = null;
        this._tailNodeId = null;
        this._isRunning = false;
        this._isStopping = false;
        this._currentRoundIndex = 0;
        this._totalRounds = 0;
        this._nodeStates = new Map(); // nodeId -> 'wait' | 'running' | 'done' | 'failed'
        this._edgeStates = new Map(); // edgeId/key -> 'wait' | 'active' | 'done' | 'failed'
        this._errors = [];
    }

    /**
     * 校验尾节点是否可发起级联
     */
    canRun(tailNodeId, nodes = [], connections = []) {
        if (!tailNodeId) return { ok: false, reason: 'TAIL_MISSING' };

        const nodeList = Array.isArray(nodes) ? nodes : Object.values(nodes);
        const nodeMap = new Map(nodeList.map(n => [n.id, n]));

        const tailNode = nodeMap.get(tailNodeId);
        if (!tailNode) return { ok: false, reason: 'TAIL_NOT_FOUND' };

        if (tailNode.type === 'smart-group' || tailNode.type === 'group') {
            return { ok: false, reason: 'GROUP_CANNOT_BE_TAIL' };
        }

        // 查找指向该节点的入边
        const incoming = connections.filter(c => c.to === tailNodeId || c.target === tailNodeId);
        if (incoming.length === 0) {
            return { ok: false, reason: 'NO_UPSTREAM_CHAIN' };
        }

        return { ok: true, reason: null };
    }

    /**
     * 从尾节点向上游反向构图，产出节点与边集合
     */
    buildUpstreamGraph(tailNodeId, nodes = [], connections = []) {
        const nodeList = Array.isArray(nodes) ? nodes : Object.values(nodes);
        const nodeMap = new Map(nodeList.map(n => [n.id, n]));

        const visitedNodes = new Set();
        const visitedEdges = new Set();
        const queue = [tailNodeId];

        while (queue.length > 0) {
            const currentId = queue.shift();
            if (visitedNodes.has(currentId)) continue;
            visitedNodes.add(currentId);

            const incoming = connections.filter(c => c.to === currentId || c.target === currentId);
            for (const conn of incoming) {
                const edgeKey = conn.id || `${conn.from || conn.source}->${conn.to || conn.target}`;
                visitedEdges.add({
                    id: edgeKey,
                    from: conn.from || conn.source,
                    to: conn.to || conn.target
                });

                const upstreamId = conn.from || conn.source;
                if (upstreamId && !visitedNodes.has(upstreamId)) {
                    queue.push(upstreamId);
                }
            }
        }

        const graphNodes = Array.from(visitedNodes).map(id => nodeMap.get(id)).filter(Boolean);
        const graphEdges = Array.from(visitedEdges);

        return {
            nodes: graphNodes,
            edges: graphEdges,
            nodeIds: Array.from(visitedNodes)
        };
    }

    /**
     * 对节点拓扑分轮次调度
     */
    scheduleRounds(nodes = [], edges = []) {
        const inDegree = new Map();
        const adjList = new Map();
        const nodeIds = new Set(nodes.map(n => n.id));

        for (const id of nodeIds) {
            inDegree.set(id, 0);
            adjList.set(id, []);
        }

        for (const edge of edges) {
            if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
                inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
                adjList.get(edge.from).push(edge.to);
            }
        }

        const rounds = [];
        let currentLevel = Array.from(nodeIds).filter(id => inDegree.get(id) === 0);

        while (currentLevel.length > 0) {
            rounds.push(currentLevel);
            const nextLevel = [];

            for (const node of currentLevel) {
                const neighbors = adjList.get(node) || [];
                for (const neighbor of neighbors) {
                    const degree = inDegree.get(neighbor) - 1;
                    inDegree.set(neighbor, degree);
                    if (degree === 0) {
                        nextLevel.push(neighbor);
                    }
                }
            }
            currentLevel = nextLevel;
        }

        return rounds;
    }

    /**
     * 校验 ComfyUI 或默认并发上限
     */
    getConcurrencyLimit(nodesInRound = [], options = {}) {
        const hasComfy = nodesInRound.some(n => (n.type && n.type.includes('comfy')) || (n.kind && n.kind.includes('comfy')));
        if (hasComfy) {
            return options.comfyMaxConcurrency || this.comfyMaxConcurrency;
        }
        return options.defaultMaxConcurrency || this.defaultMaxConcurrency;
    }

    /**
     * 设置停止标志
     */
    stop() {
        this._isStopping = true;
        return { isStopping: true };
    }

    /**
     * 开始记录级联运行投影
     */
    start(tailNodeId, nodes = [], connections = []) {
        const canRunCheck = this.canRun(tailNodeId, nodes, connections);
        if (!canRunCheck.ok) {
            throw new Error(`Cannot start cascade: ${canRunCheck.reason}`);
        }

        this._resetState();
        this._runId = 'casc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        this._tailNodeId = tailNodeId;
        this._isRunning = true;

        const graph = this.buildUpstreamGraph(tailNodeId, nodes, connections);
        const rounds = this.scheduleRounds(graph.nodes, graph.edges);

        this._totalRounds = rounds.length;

        for (const n of graph.nodes) {
            this._nodeStates.set(n.id, 'wait');
            if (this.statusBus) {
                this.statusBus.setStatus(n.id, { status: 'queued' });
            }
        }

        for (const e of graph.edges) {
            this._edgeStates.set(e.id, 'wait');
        }

        return {
            runId: this._runId,
            graph,
            rounds
        };
    }

    /**
     * 更新节点状态并联动边状态
     */
    updateNodeState(nodeId, state, errorMsg = null) {
        this._nodeStates.set(nodeId, state);
        if (errorMsg) {
            this._errors.push({ nodeId, errorMsg, timestamp: Date.now() });
        }

        if (this.statusBus) {
            let busStatus = 'idle';
            if (state === 'running') busStatus = 'running';
            else if (state === 'done') busStatus = 'success';
            else if (state === 'failed') busStatus = 'failed';
            else if (state === 'wait') busStatus = 'queued';

            this.statusBus.setStatus(nodeId, {
                status: busStatus,
                errorMsg,
                loopRound: this._currentRoundIndex
            });
        }
    }

    /**
     * 更新边状态 (wait / active / done / failed)
     */
    updateEdgeState(edgeId, state) {
        this._edgeStates.set(edgeId, state);
    }

    /**
     * 获取完整运行态投影数据
     */
    getProjection() {
        return {
            runId: this._runId,
            tailNodeId: this._tailNodeId,
            isRunning: this._isRunning,
            isStopping: this._isStopping,
            currentRoundIndex: this._currentRoundIndex,
            totalRounds: this._totalRounds,
            nodeStates: Object.fromEntries(this._nodeStates),
            edgeStates: Object.fromEntries(this._edgeStates),
            errors: [...this._errors]
        };
    }
}

export const globalCascadeTracker = new CascadeTracker();

if (typeof window !== 'undefined') {
    window.CascadeTracker = CascadeTracker;
    window.cascadeTracker = globalCascadeTracker;
    window.globalCascadeTracker = globalCascadeTracker;
}
