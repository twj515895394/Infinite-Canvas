/**
 * SVG 连线增量渲染引擎 (ConnectionLineRenderer)
 * 解决节点移动时连线全量 DOM 重绘造成的帧率卡顿
 */
export class ConnectionLineRenderer {
    constructor(options = {}) {
        this.containerEl = options.containerEl || null;
        this.svgPathCache = new Map(); // key: "fromId->toId", value: SVGPathElement
    }

    /**
     * 挂载 SVG 容器 Element
     */
    attach(containerEl) {
        this.containerEl = containerEl;
    }

    /**
     * 计算三阶贝塞尔曲线 Path 路径
     */
    calculateBezierPath(x1, y1, x2, y2) {
        const dx = Math.abs(x2 - x1);
        const controlOffset = Math.max(40, dx * 0.5);
        
        const cp1x = x1 + controlOffset;
        const cp1y = y1;
        const cp2x = x2 - controlOffset;
        const cp2y = y2;

        return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }

    /**
     * 生成/获取 Connection Key
     */
    getConnectionKey(connection) {
        return `${connection.from}_${connection.fromPort || 'out'}->${connection.to}_${connection.toPort || 'in'}`;
    }

    /**
     * 仅重新计算并增量渲染与指定 nodeIds 关联的连线
     */
    renderIncremental(connections = [], activeNodeIds = [], getNodePosFunc) {
        if (!this.containerEl || typeof getNodePosFunc !== 'function') return;

        const activeSet = new Set(activeNodeIds);
        const currentKeys = new Set();

        for (const conn of connections) {
            const key = this.getConnectionKey(conn);
            currentKeys.add(key);

            const isRelatedToActive = activeSet.has(conn.from) || activeSet.has(conn.to) || activeSet.size === 0;

            let pathEl = this.svgPathCache.get(key);

            // 如果路径不存在，创建 SVG Path 节点
            if (!pathEl) {
                pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                pathEl.setAttribute('class', 'smart-connection-line');
                pathEl.setAttribute('data-key', key);
                this.containerEl.appendChild(pathEl);
                this.svgPathCache.set(key, pathEl);
            }

            // 如果是关联活动节点，或者是新创建的，才计算更新坐标属性（避免无关连线重复计算）
            if (isRelatedToActive) {
                const startPos = getNodePosFunc(conn.from, conn.fromPort, 'out');
                const endPos = getNodePosFunc(conn.to, conn.toPort, 'in');

                if (startPos && endPos) {
                    const pathD = this.calculateBezierPath(startPos.x, startPos.y, endPos.x, endPos.y);
                    pathEl.setAttribute('d', pathD);
                }
            }
        }

        // 清理已被删除的连线 DOM 节点
        for (const [key, pathEl] of this.svgPathCache.entries()) {
            if (!currentKeys.has(key)) {
                if (pathEl.parentNode) {
                    pathEl.parentNode.removeChild(pathEl);
                }
                this.svgPathCache.delete(key);
            }
        }
    }

    /**
     * 清空全部连线
     */
    clear() {
        if (this.containerEl) {
            this.containerEl.innerHTML = '';
        }
        this.svgPathCache.clear();
    }
}

// 导出单例渲染器
export const connectionLineRenderer = new ConnectionLineRenderer();
