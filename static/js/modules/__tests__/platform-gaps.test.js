import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAvatarPlatform, listAvatarPlatforms } from '../avatar-platform-bridge.js';
import { SettingsCapabilitiesDetector } from '../settings-capabilities.js';

test('validateAvatarPlatform approves supported platforms', () => {
    const res1 = validateAvatarPlatform('bilibili');
    assert.equal(res1.supported, true);

    const res2 = validateAvatarPlatform('youtube');
    assert.equal(res2.supported, true);
});

test('validateAvatarPlatform intercepts pending integration platforms', () => {
    const res = validateAvatarPlatform('kuaishou');
    assert.equal(res.supported, false);
    assert.equal(res.code, 'PLATFORM_PENDING_INTEGRATION');
    assert.ok(res.message.includes('暂未接入'));
});

test('validateAvatarPlatform handles invalid or missing inputs', () => {
    const missing = validateAvatarPlatform('');
    assert.equal(missing.supported, false);
    assert.equal(missing.code, 'PLATFORM_REQUIRED');

    const unknown = validateAvatarPlatform('unknown_platform_xyz');
    assert.equal(unknown.supported, false);
    assert.equal(unknown.code, 'PLATFORM_UNKNOWN');
});

test('listAvatarPlatforms returns platform whitelist array', () => {
    const list = listAvatarPlatforms();
    assert.ok(list.length >= 5);
    assert.ok(list.some(p => p.id === 'bilibili'));
});

test('SettingsCapabilitiesDetector fetches and formats CLI summary HTML', async () => {
    const mockApiClient = {
        runtimeCapabilities: {
            get: async () => ({
                cli_tools: [
                    { name: 'codex', ready: true, executable_path: '/usr/bin/codex' },
                    { name: 'gemini', ready: false, reason: 'CLI not found' }
                ]
            })
        }
    };

    const detector = new SettingsCapabilitiesDetector({ apiClient: mockApiClient });
    const data = await detector.fetchCapabilities();

    assert.equal(data.cli_tools.length, 2);

    const html = detector.formatSummaryHtml();
    assert.ok(html.includes('codex'));
    assert.ok(html.includes('gemini'));
    assert.ok(html.includes('READY'));
    assert.ok(html.includes('UNAVAILABLE'));
});
