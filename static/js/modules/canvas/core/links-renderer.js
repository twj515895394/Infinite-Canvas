/**
 * Legacy Canvas Links Renderer (Native ESM Core)
 * 节点 SVG 连线渲染器：负责计算贝塞尔曲线路径并渲染至 #links。
 */

export class LinksRenderer {
    constructor() {
        this.svgEl = null;
    }

    init() {
        if (typeof document === 'undefined') return;
        this.svgEl = document.getElementById('links');
    }

    createBezierPath(x1, y1, x2, y2) {
        const dx = Math.abs(x2 - x1) * 0.5;
        const cx1 = x1 + Math.max(40, dx);
        const cy1 = y1;
        const cx2 = x2 - Math.max(40, dx);
        const cy2 = y2;
        return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    }

    renderLinks(connections = [], nodes = []) {
        if (!this.svgEl) this.svgEl = document.getElementById('links');
        if (!this.svgEl) return;

        const paths = connections.map(conn => {
            const fromNode = nodes.find(n => n.id === conn.from);
            const toNode = nodes.find(n => n.id === conn.to);
            if (!fromNode || !toNode) return '';

            const x1 = (fromNode.x || 0) + (fromNode.w || 260);
            const y1 = (fromNode.y || 0) + (fromNode.h || 150) / 2;
            const x2 = (toNode.x || 0);
            const y2 = (toNode.y || 0) + (toNode.h || 150) / 2;

            const d = this.createBezierPath(x1, y1, x2, y2);
            return `<path d="${d}" class="link-path" data-from="${conn.from}" data-to="${conn.to}" />`;
        });

        this.svgEl.innerHTML = paths.join('');
    }
}

export const linksRenderer = new LinksRenderer();

if (typeof window !== 'undefined') {
    window.LinksRenderer = LinksRenderer;
    window.linksRenderer = linksRenderer;
}
