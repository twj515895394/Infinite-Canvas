/**
 * Smart Canvas Prompt Template Hub (Native ESM)
 * 提示词模板中心：分组与搜索、系统与「我的模板」、套用到节点/Composer、新建/编辑/删除我的模板。
 */

import { globalChainPresetHub } from './chain-preset-hub.js';

export class PromptTemplateHub {
    constructor(options = {}) {
        this.storageKey = options.storageKey || 'infinite_canvas_user_prompt_templates';
        this.storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        this.chainPresetHub = options.chainPresetHub || globalChainPresetHub;
        this.activeTab = options.activeTab || 'templates'; // 'templates' | 'chain_presets'
        
        this.systemTemplates = options.systemTemplates || [
            { id: 'sys_1', title: '大师级人像写真', group: '人像写真', content: 'Masterpiece, cinematic lighting, 8k portrait, detailed skin texture, shallow depth of field, photorealistic', isSystem: true },
            { id: 'sys_2', title: '赛博朋克城市夜景', group: '场景概念', content: 'Cyberpunk city street at rainy night, vibrant neon lights, reflections on wet pavement, futuristic architecture, 8k resolution', isSystem: true },
            { id: 'sys_3', title: '吉卜力吉卜力动漫风', group: '艺术风格', content: 'Ghibli style anime landscape, lush green hills, fluffy clouds, bright sunny sky, hand drawn aesthetic', isSystem: true },
            { id: 'sys_4', title: '3D 盲盒角色设计', group: '角色设计', content: 'Cute 3D blind box toy character, isometric view, smooth clay texture, vibrant pastel colors, studio lighting, Octane render', isSystem: true }
        ];

        this.userTemplates = this.loadUserTemplates();
    }

    switchTab(tabName) {
        if (['templates', 'chain_presets'].includes(tabName)) {
            this.activeTab = tabName;
        }
        return this.activeTab;
    }

    getChainPresets() {
        return this.chainPresetHub ? this.chainPresetHub.getAllPresets() : [];
    }

    loadUserTemplates() {
        if (!this.storage) return [];
        try {
            const raw = this.storage.getItem(this.storageKey);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('[PromptTemplateHub] Failed to load user templates:', e);
            return [];
        }
    }

    saveUserTemplates() {
        if (!this.storage) return;
        try {
            this.storage.setItem(this.storageKey, JSON.stringify(this.userTemplates));
        } catch (e) {
            console.error('[PromptTemplateHub] Failed to save user templates:', e);
        }
    }

    getAllTemplates() {
        return [...this.systemTemplates, ...this.userTemplates];
    }

    filterTemplates({ group = null, search = '', type = 'all' } = {}) {
        let list = this.getAllTemplates();

        if (type === 'system') {
            list = list.filter(t => t.isSystem);
        } else if (type === 'user') {
            list = list.filter(t => !t.isSystem);
        }

        if (group && group !== 'all') {
            list = list.filter(t => t.group === group);
        }

        if (search && search.trim()) {
            const query = search.trim().toLowerCase();
            list = list.filter(t => 
                (t.title && t.title.toLowerCase().includes(query)) ||
                (t.content && t.content.toLowerCase().includes(query)) ||
                (t.group && t.group.toLowerCase().includes(query))
            );
        }

        return list;
    }

    getGroups() {
        const groups = new Set();
        this.getAllTemplates().forEach(t => {
            if (t.group) groups.add(t.group);
        });
        return Array.from(groups);
    }

    addUserTemplate({ title, content, group = '未分类' }) {
        if (!title || !content) {
            throw new Error('Title and content are required for template');
        }

        const newTemplate = {
            id: 'tmpl_usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            title: title.trim(),
            content: content.trim(),
            group: group.trim() || '未分类',
            isSystem: false,
            createdAtMs: Date.now()
        };

        this.userTemplates.push(newTemplate);
        this.saveUserTemplates();
        return newTemplate;
    }

    updateUserTemplate(id, { title, content, group }) {
        const index = this.userTemplates.findIndex(t => t.id === id);
        if (index === -1) {
            throw new Error(`User template ${id} not found or read-only system template`);
        }

        const existing = this.userTemplates[index];
        const updated = {
            ...existing,
            title: title !== undefined ? title.trim() : existing.title,
            content: content !== undefined ? content.trim() : existing.content,
            group: group !== undefined ? group.trim() : existing.group,
            updatedAtMs: Date.now()
        };

        this.userTemplates[index] = updated;
        this.saveUserTemplates();
        return updated;
    }

    deleteUserTemplate(id) {
        const index = this.userTemplates.findIndex(t => t.id === id);
        if (index === -1) {
            return false;
        }

        this.userTemplates.splice(index, 1);
        this.saveUserTemplates();
        return true;
    }

    applyToTarget(templateId, targetObject, fieldName = 'prompt') {
        const all = this.getAllTemplates();
        const template = all.find(t => t.id === templateId);
        if (!template) {
            throw new Error(`Template ${templateId} not found`);
        }

        if (targetObject && typeof targetObject === 'object') {
            targetObject[fieldName] = template.content;
            return true;
        }
        return false;
    }
}

export const globalPromptTemplateHub = new PromptTemplateHub();

if (typeof window !== 'undefined') {
    window.PromptTemplateHub = PromptTemplateHub;
    window.promptTemplateHub = globalPromptTemplateHub;
    window.globalPromptTemplateHub = globalPromptTemplateHub;
}
