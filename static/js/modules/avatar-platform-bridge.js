/**
 * Legacy Frontend Avatar Platform Bridge (Native ESM)
 * 校验与同步 Avatar 认证平台白名单，对未接入平台进行明确拦截与提示。
 */

export const SUPPORTED_AVATAR_PLATFORMS = [
    { id: 'bilibili', name: 'Bilibili 哔哩哔哩', supported: true },
    { id: 'douyin', name: 'Douyin 抖音', supported: true },
    { id: 'xiaohongshu', name: 'Xiaohongshu 小红书', supported: true },
    { id: 'youtube', name: 'YouTube', supported: true },
    { id: 'tiktok', name: 'TikTok', supported: true },
    { id: 'kuaishou', name: 'Kuaishou 快手', supported: false, label: '待接入' },
    { id: 'weibo', name: 'Weibo 微博', supported: false, label: '待接入' }
];

export function validateAvatarPlatform(platformId) {
    if (!platformId) {
        return { supported: false, code: 'PLATFORM_REQUIRED', message: '请选择 Avatar 平台' };
    }

    const item = SUPPORTED_AVATAR_PLATFORMS.find(p => p.id === platformId.toLowerCase());
    if (!item) {
        return {
            supported: false,
            code: 'PLATFORM_UNKNOWN',
            message: `未知平台 "${platformId}"`
        };
    }

    if (!item.supported) {
        return {
            supported: false,
            code: 'PLATFORM_PENDING_INTEGRATION',
            message: `平台 "${item.name}" 暂未接入，请关注后续更新`
        };
    }

    return {
        supported: true,
        platform: item
    };
}

export function listAvatarPlatforms() {
    return [...SUPPORTED_AVATAR_PLATFORMS];
}
