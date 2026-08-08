import test from 'node:test';
import assert from 'node:assert/strict';
import { PromptTemplateHub } from '../prompt-template-hub.js';

class MemoryStorage {
    constructor() {
        this.store = new Map();
    }
    getItem(key) { return this.store.get(key) || null; }
    setItem(key, value) { this.store.set(key, String(value)); }
    removeItem(key) { this.store.delete(key); }
}

test('PromptTemplateHub lists system templates and filters correctly', () => {
    const hub = new PromptTemplateHub({ storage: new MemoryStorage() });
    const all = hub.getAllTemplates();
    assert.ok(all.length >= 4);

    const filtered = hub.filterTemplates({ search: '赛博朋克' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].title, '赛博朋克城市夜景');
});

test('PromptTemplateHub manages user templates CRUD', () => {
    const storage = new MemoryStorage();
    const hub = new PromptTemplateHub({ storage });

    const created = hub.addUserTemplate({
        title: '我的专有用词',
        content: 'custom prompt body text',
        group: '个人项目'
    });

    assert.ok(created.id.startsWith('tmpl_usr_'));
    assert.equal(hub.filterTemplates({ type: 'user' }).length, 1);

    hub.updateUserTemplate(created.id, { title: '我的专有用词 (修改版)' });
    const updated = hub.filterTemplates({ type: 'user' })[0];
    assert.equal(updated.title, '我的专有用词 (修改版)');

    const deleted = hub.deleteUserTemplate(created.id);
    assert.equal(deleted, true);
    assert.equal(hub.filterTemplates({ type: 'user' }).length, 0);
});

test('PromptTemplateHub applies template to target node object', () => {
    const hub = new PromptTemplateHub({ storage: new MemoryStorage() });
    const targetNode = { prompt: '' };

    hub.applyToTarget('sys_1', targetNode, 'prompt');
    assert.ok(targetNode.prompt.includes('Masterpiece'));
});
