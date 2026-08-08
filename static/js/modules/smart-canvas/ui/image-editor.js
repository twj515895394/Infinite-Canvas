/**
 * Smart Canvas Image Editor Controller (Native ESM UI)
 * 图片编辑器控制器：提供预览、裁剪、拓展 (Outpaint)、遮罩 (Mask)、画笔 (Brush)、缩放 (Resize) 与 宫格切分/拼接。
 */

export class ImageEditorController {
    constructor() {
        this.cropState = null;
        this.cropDrag = null;
        this.imageEditZoom = 1.0;
        this.imageEditBaseW = 0;
        this.imageEditBaseH = 0;
        this.imageResizeScale = 0.5;
        this.cropAspectPreset = 'free';
        this.cropAspectRatio = null;
        this.imageEditMode = 'crop';
        this.gridCustomLines = [];
        this.gridCustomHistory = [];
        this.gridCustomMode = false;
        this.gridCustomOrientation = 'h';
    }

    openImageEditor(node, initialMode = 'crop') {
        if (!node || !node.url) return;
        const modal = document.getElementById('imageEditModal');
        if (!modal) return;

        const validModes = ['preview', 'crop', 'outpaint', 'mask', 'brush', 'resize', 'grid'];
        this.imageEditMode = validModes.includes(initialMode) ? initialMode : 'crop';
        this.cropState = { nodeId: node.id, x: 0, y: 0, w: 0, h: 0 };

        this.gridCustomMode = false;
        this.gridCustomLines = [];
        this.gridCustomHistory = [];
        this.imageEditZoom = 1.0;
        this.imageEditBaseW = 0;
        this.imageEditBaseH = 0;

        modal.classList.add('open');

        const img = document.getElementById('cropImage');
        if (img) {
            img.style.width = '';
            img.style.height = '';
            img.onload = () => {
                this.imageEditBaseW = img.clientWidth;
                this.imageEditBaseH = img.clientHeight;
                this.updateZoomLabel();
                this.resetCropBox();
                this.setImageEditMode(this.imageEditMode);
            };
            img.crossOrigin = 'anonymous';
            img.src = node.url;
        }

        this.setImageEditMode(this.imageEditMode);
    }

    closeImageEditor() {
        const modal = document.getElementById('imageEditModal');
        if (modal) modal.classList.remove('open');

        const img = document.getElementById('cropImage');
        if (img) {
            img.onload = null;
            img.removeAttribute('src');
        }

        this.cropState = null;
        this.cropDrag = null;
        this.imageEditZoom = 1.0;
    }

    setImageEditMode(mode) {
        this.imageEditMode = mode;
        const modal = document.getElementById('imageEditModal');
        if (!modal) return;

        modal.querySelectorAll('.image-edit-mode button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.imageEditMode === mode);
        });

        const toolsMap = {
            crop: 'imageCropTools',
            preview: 'imagePreviewTools',
            mask: 'imageMaskTools',
            brush: 'imageBrushTools',
            resize: 'imageResizeTools',
            grid: 'imageGridTools'
        };

        Object.entries(toolsMap).forEach(([m, id]) => {
            const el = document.getElementById(id);
            if (el) el.style.display = (m === mode) ? (m === 'grid' || m === 'crop' ? 'flex' : 'flex') : 'none';
        });
    }

    resetCropBox() {
        if (!this.cropState) return;
        const img = document.getElementById('cropImage');
        if (!img) return;

        const w = img.clientWidth || 300;
        const h = img.clientHeight || 300;
        this.cropState = {
            ...this.cropState,
            x: Math.round(w * 0.1),
            y: Math.round(h * 0.1),
            w: Math.round(w * 0.8),
            h: Math.round(h * 0.8)
        };
        this.renderCropBox();
    }

    renderCropBox() {
        if (!this.cropState) return;
        const box = document.getElementById('cropBox');
        if (box) {
            box.style.left = `${this.cropState.x}px`;
            box.style.top = `${this.cropState.y}px`;
            box.style.width = `${this.cropState.w}px`;
            box.style.height = `${this.cropState.h}px`;
        }
    }

    updateZoomLabel() {
        const el = document.getElementById('imageEditZoomLabel');
        if (el) el.textContent = `${Math.round(this.imageEditZoom * 100)}%`;
    }

    async applyImageEdit() {
        if (!this.cropState) return;
        switch (this.imageEditMode) {
            case 'crop':
                await this.applyCrop();
                break;
            default:
                this.closeImageEditor();
                break;
        }
    }

    async applyCrop() {
        const img = document.getElementById('cropImage');
        if (!img || !img.naturalWidth || !this.cropState) return;

        const scaleX = img.naturalWidth / (img.clientWidth || 1);
        const scaleY = img.naturalHeight / (img.clientHeight || 1);

        const canvasEl = document.createElement('canvas');
        canvasEl.width = Math.max(1, Math.round(this.cropState.w * scaleX));
        canvasEl.height = Math.max(1, Math.round(this.cropState.h * scaleY));

        const ctx = canvasEl.getContext('2d');
        ctx.drawImage(
            img,
            Math.round(this.cropState.x * scaleX),
            Math.round(this.cropState.y * scaleY),
            canvasEl.width,
            canvasEl.height,
            0,
            0,
            canvasEl.width,
            canvasEl.height
        );

        this.closeImageEditor();
    }
}

export const imageEditorController = new ImageEditorController();

if (typeof window !== 'undefined') {
    window.ImageEditorController = ImageEditorController;
    window.imageEditorController = imageEditorController;
    window.openImageEditor = (nodeId, mode) => {
        const store = window.canvasStateStore;
        const node = store ? store.getNode(nodeId) : (window.nodes || []).find(n => n.id === nodeId);
        imageEditorController.openImageEditor(node, mode);
    };
    window.closeImageEditor = () => imageEditorController.closeImageEditor();
    window.applyImageEdit = () => imageEditorController.applyImageEdit();
}
