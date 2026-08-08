/**
 * Smart Canvas Chain Preset Hub (Native ESM)
 * 链路/工作流预设套用模块：预设浏览、结构预览（Diff Preview）、非破坏性画布套用、Undo 恢复及 Workflow 包导入导出。
 */

export class ChainPresetHub {
    constructor(options = {}) {
        this.storageKey = options.storageKey || 'infinite_canvas_user_chain_presets';
        this.storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        
        // 内置标准链路预设
        this.systemPresets = options.systemPresets || [
            {
                id: 'chain_text_to_image_enhancer',
                title: '文生图 + 提示词增强 + Comfy 级联链',
                category: '经典生成',
                description: '包含提示词输入、Agent 提示词增强节点及图像生成节点',
                nodes: [
                    { tempId: 'n1', type: 'prompt-node', title: '基础提示词', prompt: '赛博朋克风格都市', offset: { x: 0, y: 0 } },
                    { tempId: 'n2', type: 'smart-agent-task', title: 'Agent 润色', config: { instruction: '扩写为大师级赛博朋克景物 Prompt' }, offset: { x: 260, y: 0 } },
                    { tempId: 'n3', type: 'smart-image', title: 'ComfyUI 绘图', engine: 'comfyui', offset: { x: 540, y: 0 } }
                ],
                edges: [
                    { sourceTempId: 'n1', targetTempId: 'n2' },
                    { sourceTempId: 'n2', targetTempId: 'n3' }
                ],
                isSystem: true
            },
            {
                id: 'chain_image_to_video_loop',
                title: '图生视频 + 多轮级联循环链',
                category: '视频动画',
                description: '图片节点连接视频节点，配合循环轮次生成多集序列',
                nodes: [
                    { tempId: 'n1', type: 'smart-image', title: '首帧参考图', offset: { x: 0, y: 0 } },
                    { tempId: 'n2', type: 'loop-node', title: '循环控制器', config: { loopCount: 3 }, offset: { x: 280, y: 0 } },
                    { tempId: 'n3', type: 'smart-video', title: '即梦/Runway 动画', engine: 'jimeng', offset: { x: 520, y: 0 } }
                ],
                edges: [
                    { sourceTempId: 'n1', targetTempId: 'n2' },
                    { sourceTempId: 'n2', targetTempId: 'n3' }
                ],
                isSystem: true
            }
        ];

        this.userPresets = this.loadUserPresets();
        this.lastUndoSnapshot = null;
    }

    loadUserPresets() {
        if (!this.storage) return [];
        try {
            const raw = this.storage.getItem(this.storageKey);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('[ChainPresetHub] Failed to load user presets:', e);
            return [];
        }
    }

    saveUserPresets() {
        if (!this.storage) return;
        try {
            this.storage.setItem(this.storageKey, JSON.stringify(this.userPresets));
        } catch (e) {
            console.error('[ChainPresetHub] Failed to save user presets:', e);
        }
    }

    getAllPresets() {
        return [...this.systemPresets, ...this.userPresets];
    }

    getPreset(presetId) {
        return this.getAllPresets().find(p => p.id === presetId) || null;
    }

    /**
     * 结构预览：计算即将新增的节点与连线（不修改画布状态）
     */
    previewChainPreset(presetId, anchorPos = { x: 100, y: 100 }) {
        const preset = this.getPreset(presetId);
        if (!preset) {
            throw new Error(`Preset ${presetId} not found`);
        }

        const previewNodes = preset.nodes.map((node, index) => {
            const posX = anchorPos.x + (node.offset ? node.offset.x : index * 240);
            const posY = anchorPos.y + (node.offset ? node.offset.y : 0);
            return {
                previewId: `prev_${node.tempId}`,
                type: node.type,
                title: node.title,
                position: { x: posX, y: posY }
            };
        });

        const previewEdges = preset.edges.map(edge => ({
            sourcePreviewId: `prev_${edge.sourceTempId}`,
            targetPreviewId: `prev_${edge.targetTempId}`
        }));

        return {
            presetId: preset.id,
            title: preset.title,
            nodeCount: previewNodes.length,
            edgeCount: previewEdges.length,
            previewNodes,
            previewEdges
        };
    }

    /**
     * 非破坏性套用预设到 CanvasStateStore，包含 Undo 快照支持
     */
    applyChainPreset(presetId, canvasStateStore, anchorPos = { x: 100, y: 100 }) {
        const preset = this.getPreset(presetId);
        if (!preset) {
            throw new Error(`Preset ${presetId} not found`);
        }
        if (!canvasStateStore) {
            throw new Error('CanvasStateStore is required to apply preset');
        }

        // 保存 Undo 快照
        if (typeof canvasStateStore.getSnapshot === 'function') {
            this.lastUndoSnapshot = canvasStateStore.getSnapshot();
        }

        const idMapping = new Map(); // tempId -> realNodeId
        const createdNodes = [];
        const createdEdges = [];

        // 1. 创建节点骨架（不修改原有未选中节点）
        for (let i = 0; i < preset.nodes.length; i++) {
            const template = preset.nodes[i];
            const realId = `node_preset_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
            idMapping.set(template.tempId, realId);

            const posX = anchorPos.x + (template.offset ? template.offset.x : i * 240);
            const posY = anchorPos.y + (template.offset ? template.offset.y : 0);

            const nodeData = {
                id: realId,
                type: template.type,
                title: template.title,
                x: posX,
                y: posY,
                config: template.config ? { ...template.config } : {},
                engine: template.engine || undefined,
                prompt: template.prompt || undefined
            };

            if (typeof canvasStateStore.addNode === 'function') {
                canvasStateStore.addNode(nodeData);
            }
            createdNodes.push(nodeData);
        }

        // 2. 创建默认连线
        for (const edgeTemplate of preset.edges) {
            const sourceId = idMapping.get(edgeTemplate.sourceTempId);
            const targetId = idMapping.get(edgeTemplate.targetTempId);

            if (sourceId && targetId) {
                const edgeData = {
                    id: `edge_${sourceId}_${targetId}`,
                    source: sourceId,
                    target: targetId
                };
                if (typeof canvasStateStore.addEdge === 'function') {
                    canvasStateStore.addEdge(edgeData);
                }
                createdEdges.push(edgeData);
            }
        }

        return {
            success: true,
            presetId: preset.id,
            nodes: createdNodes,
            edges: createdEdges
        };
    }

    /**
     * Undo 恢复
     */
    undoApplyPreset(canvasStateStore) {
        if (!this.lastUndoSnapshot || !canvasStateStore) {
            return false;
        }
        if (typeof canvasStateStore.restoreSnapshot === 'function') {
            canvasStateStore.restoreSnapshot(this.lastUndoSnapshot);
            this.lastUndoSnapshot = null;
            return true;
        }
        return false;
    }

    /**
     * JSON 导入导出互通
     */
    exportPresetAsJson(presetId) {
        const preset = this.getPreset(presetId);
        if (!preset) throw new Error(`Preset ${presetId} not found`);
        return JSON.stringify(preset, null, 2);
    }

    importPresetFromJson(jsonString) {
        const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
        if (!parsed.title || !Array.isArray(parsed.nodes)) {
            throw new Error('Invalid preset JSON format: missing title or nodes array');
        }

        const newPreset = {
            id: 'preset_usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            title: parsed.title.trim(),
            category: parsed.category || '自定义',
            description: parsed.description || '',
            nodes: parsed.nodes,
            edges: parsed.edges || [],
            isSystem: false,
            createdAtMs: Date.now()
        };

        this.userPresets.push(newPreset);
        this.saveUserPresets();
        return newPreset;
    }
}

export const globalChainPresetHub = new ChainPresetHub();

if (typeof window !== 'undefined') {
    window.ChainPresetHub = ChainPresetHub;
    window.chainPresetHub = globalChainPresetHub;
    window.globalChainPresetHub = globalChainPresetHub;
}
