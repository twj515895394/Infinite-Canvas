/**
 * Smart Canvas Generation Service (Native ESM API)
 * 生成服务模块：封装网络请求服务（API 生图、VolcEngine、ModelScope、ComfyUI 与 RunningHub）。
 */

export class GenerationService {
    constructor() {
        this.apiEndpoint = '/api/ai/generate';
    }

    async generate(params = {}, options = {}) {
        const payload = {
            engine: params.engine || 'api',
            prompt: params.prompt || '',
            aspect_ratio: params.aspect_ratio || '1:1',
            ...params
        };

        const response = await fetch(this.apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: options.signal
        });

        if (!response.ok) {
            throw new Error(`Generation API failed with status ${response.status}`);
        }

        return await response.json();
    }

    async uploadAsset(file) {
        const formData = new FormData();
        formData.append('files', file);

        const response = await fetch('/api/ai/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Upload asset failed with status ${response.status}`);
        }

        const data = await response.json();
        return data.files ? data.files[0] : null;
    }
}

export const globalGenerationService = new GenerationService();

if (typeof window !== 'undefined') {
    window.GenerationService = GenerationService;
    window.generationService = globalGenerationService;
    window.globalGenerationService = globalGenerationService;
}
