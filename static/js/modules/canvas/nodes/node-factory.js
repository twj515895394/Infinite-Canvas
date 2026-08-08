/**
 * Legacy Canvas Node Factory (Native ESM Nodes)
 * 节点工厂模块：支持单节点画布各种节点类型创建与默认配置初始化。
 */

export class LegacyNodeFactory {
    generateUid(prefix = 'node') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    createNode(type, options = {}) {
        const id = this.generateUid(type);
        const base = {
            id,
            type,
            x: options.x || 100,
            y: options.y || 100,
            w: options.w || 280,
            h: options.h || 180,
            name: options.name || `${type.toUpperCase()} Node`,
            ...options
        };

        switch (type) {
            case 'prompt':
                base.text = options.text || '';
                break;
            case 'image':
                base.url = options.url || '';
                break;
            case 'loop':
                base.count = options.count || 3;
                break;
            case 'generator':
                base.engine = options.engine || 'api';
                base.prompt = options.prompt || '';
                break;
            default:
                break;
        }

        if (typeof window !== 'undefined' && Array.isArray(window.nodes)) {
            window.nodes.push(base);
            if (typeof window.render === 'function') {
                window.render();
            }
        }

        return base;
    }
}

export const legacyNodeFactory = new LegacyNodeFactory();

if (typeof window !== 'undefined') {
    window.LegacyNodeFactory = LegacyNodeFactory;
    window.legacyNodeFactory = legacyNodeFactory;
    window.addImageNode = () => legacyNodeFactory.createNode('image');
    window.addPromptNode = () => legacyNodeFactory.createNode('prompt');
    window.addLoopNode = () => legacyNodeFactory.createNode('loop');
    window.addLLMNode = () => legacyNodeFactory.createNode('llm');
    window.addGeneratorNode = () => legacyNodeFactory.createNode('generator');
    window.addMsGenNode = () => legacyNodeFactory.createNode('msgen');
    window.addVideoNode = () => legacyNodeFactory.createNode('video');
    window.addMiniMaxNode = () => legacyNodeFactory.createNode('minimax');
    window.addRhNode = () => legacyNodeFactory.createNode('rh');
    window.addComfyNode = () => legacyNodeFactory.createNode('comfy');
    window.addLTXDirectorNode = () => legacyNodeFactory.createNode('ltxDirector');
    window.addOutputNode = () => legacyNodeFactory.createNode('output');
}
