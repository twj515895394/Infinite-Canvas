/**
 * Legacy Canvas Lightbox Controller (Native ESM UI)
 * 输出结果 Lightbox 控制器：管理 #outputLightbox 弹窗放大预览、下载与再次运行。
 */

export class LightboxController {
    constructor() {
        this.lightbox = null;
        this.activeNodeId = null;
    }

    init() {
        if (typeof document === 'undefined') return;
        this.lightbox = document.getElementById('outputLightbox');
    }

    open(nodeId) {
        if (!this.lightbox) this.lightbox = document.getElementById('outputLightbox');
        this.activeNodeId = nodeId;

        if (this.lightbox) {
            this.lightbox.classList.add('open');
        }

        const imgEl = document.getElementById('outputLightboxImg');
        const store = window.canvasStateStore;
        const node = store ? store.getNode(nodeId) : (window.nodes || []).find(n => n.id === nodeId);

        if (node && imgEl) {
            imgEl.src = node.url || (node.images && node.images[0]) || '';
        }
    }

    close() {
        if (!this.lightbox) this.lightbox = document.getElementById('outputLightbox');
        if (this.lightbox) {
            this.lightbox.classList.remove('open');
        }
        this.activeNodeId = null;
    }
}

export const lightboxController = new LightboxController();

if (typeof window !== 'undefined') {
    window.LightboxController = LightboxController;
    window.lightboxController = lightboxController;
    window.openOutputLightbox = (nodeId) => lightboxController.open(nodeId);
    window.closeOutputLightbox = () => lightboxController.close();
}
