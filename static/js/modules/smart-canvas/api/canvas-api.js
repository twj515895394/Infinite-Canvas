/**
 * CanvasAPI 网络通信与数据交互服务
 * 收拢与 FastAPI 后端的交互，包含画布持久化、生成任务提交等
 */
export class CanvasAPIService {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || '';
    }

    /**
     * 封装异步 fetch 请求
     */
    async request(url, options = {}) {
        const fullUrl = this.baseUrl + url;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        try {
            const res = await fetch(fullUrl, { ...options, headers });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`HTTP Error ${res.status}: ${errText}`);
            }
            return await res.json();
        } catch (err) {
            console.error(`[CanvasAPI] Request failed (${url}):`, err);
            throw err;
        }
    }

    /**
     * 加载指定画布数据
     */
    async loadCanvas(canvasId) {
        if (!canvasId) return null;
        return this.request(`/api/canvas/${encodeURIComponent(canvasId)}`);
    }

    /**
     * 保存画布数据
     */
    async saveCanvas(canvasId, canvasData) {
        if (!canvasId) return null;
        return this.request(`/api/canvas/${encodeURIComponent(canvasId)}`, {
            method: 'POST',
            body: JSON.stringify(canvasData)
        });
    }

    /**
     * 提交生成任务 (API / ComfyUI / RunningHub)
     */
    async submitGenerationJob(jobData) {
        return this.request('/api/generate', {
            method: 'POST',
            body: JSON.stringify(jobData)
        });
    }
}

// 导出单例服务
export const canvasAPIService = new CanvasAPIService();
