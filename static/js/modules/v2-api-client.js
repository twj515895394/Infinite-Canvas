/**
 * Legacy Frontend 统一 /api/v2 API Client (Native ESM)
 * 封装 Agents, Assets, Tasks, Bootstrap, Runtime Capabilities 等访问。
 * 支持 Epoch 毫秒、problem+json 错误归一、Idempotency-Key、FormData 及 Timeout 处理。
 */

export class ApiError extends Error {
    constructor(problem) {
        super(problem.detail || problem.title || problem.message || 'V2 API Request Failed');
        this.name = 'ApiError';
        this.type = problem.type || 'about:blank';
        this.title = problem.title || 'Error';
        this.status = problem.status || 500;
        this.detail = problem.detail || '';
        this.code = problem.code || 'INTERNAL_ERROR';
        this.requestId = problem.request_id || problem.requestId || '';
        this.retryable = Boolean(problem.retryable);
        this.fieldErrors = problem.field_errors || problem.fieldErrors || [];
        this.context = problem.context || {};
        this.raw = problem;
    }
}

export function normalizeError(err, status = 500) {
    if (err instanceof ApiError) return err;
    const defaultCode = status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED';
    const problem = {
        type: 'about:blank',
        title: err.message || 'Request Failed',
        status: err.status || status,
        detail: err.message || '',
        code: err.code || defaultCode,
        request_id: '',
        retryable: status === 429 || status >= 502,
        field_errors: [],
        context: {}
    };
    return new ApiError(problem);
}

export class V2APIClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || '/api/v2';
        this.fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        this.defaultTimeout = options.defaultTimeout || 30000;
    }

    generateIdempotencyKey() {
        return 'idemp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    }

    async request(path, options = {}) {
        const {
            method = 'GET',
            headers = {},
            query = null,
            body = null,
            idempotencyKey = null,
            timeout = this.defaultTimeout,
            signal = null
        } = options;

        let url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

        if (query && typeof query === 'object') {
            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(query)) {
                if (value !== undefined && value !== null) {
                    params.append(key, value);
                }
            }
            const queryString = params.toString();
            if (queryString) {
                url += (url.includes('?') ? '&' : '?') + queryString;
            }
        }

        const reqHeaders = { ...headers };

        if (idempotencyKey) {
            reqHeaders['Idempotency-Key'] = idempotencyKey;
        }

        let reqBody = body;
        const isFormData = (typeof FormData !== 'undefined' && body instanceof FormData) ||
            (body && typeof body === 'object' && body.constructor && body.constructor.name === 'FormData') ||
            (body && typeof body === 'object' && typeof body.append === 'function');
        const isBlob = (typeof Blob !== 'undefined' && body instanceof Blob);

        if (body !== null && body !== undefined && !isFormData && !isBlob && typeof body === 'object') {
            if (!reqHeaders['Content-Type']) {
                reqHeaders['Content-Type'] = 'application/json';
            }
            reqBody = JSON.stringify(body);
        }

        const controller = new AbortController();
        let timeoutId = null;

        if (timeout && timeout > 0) {
            timeoutId = setTimeout(() => controller.abort(), timeout);
        }

        if (signal) {
            signal.addEventListener('abort', () => controller.abort());
        }

        try {
            const resp = await this.fetchFn(url, {
                method,
                headers: reqHeaders,
                body: reqBody,
                signal: controller.signal
            });

            if (timeoutId) clearTimeout(timeoutId);

            if (resp.status === 204) {
                return null;
            }

            const contentType = resp.headers.get('content-type') || '';
            let data;

            if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
                data = await resp.json();
            } else {
                const text = await resp.text();
                try {
                    data = JSON.parse(text);
                } catch {
                    data = { detail: text };
                }
            }

            if (!resp.ok) {
                const problem = {
                    type: data.type || 'about:blank',
                    title: data.title || resp.statusText || 'Error',
                    status: resp.status,
                    detail: data.detail || data.message || resp.statusText,
                    code: data.code || (resp.status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED'),
                    request_id: data.request_id || resp.headers.get('x-request-id') || '',
                    retryable: data.retryable !== undefined ? data.retryable : (resp.status === 429 || resp.status >= 502),
                    field_errors: data.field_errors || [],
                    context: data.context || {}
                };
                throw new ApiError(problem);
            }

            return data;
        } catch (err) {
            if (timeoutId) clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new ApiError({
                    type: 'about:blank',
                    title: 'Request Timeout',
                    status: 408,
                    detail: `Request to ${path} timed out after ${timeout}ms`,
                    code: 'TIMEOUT',
                    retryable: true
                });
            }
            if (err instanceof ApiError) {
                throw err;
            }
            throw normalizeError(err, 500);
        }
    }

    // --- Sub-Namespaces ---

    get agents() {
        return {
            // Runtimes
            listRuntimes: (query) => this.request('/agent-runtimes', { query }),
            getRuntime: (id) => this.request(`/agent-runtimes/${id}`),
            createRuntime: (body, options = {}) => this.request('/agent-runtimes', { method: 'POST', body, ...options }),
            patchRuntime: (id, body, options = {}) => this.request(`/agent-runtimes/${id}`, { method: 'PATCH', body, ...options }),
            deleteRuntime: (id) => this.request(`/agent-runtimes/${id}`, { method: 'DELETE' }),
            probeRuntime: (id) => this.request(`/agent-runtimes/${id}/probe`, { method: 'POST' }),

            // Agent Profiles
            listProfiles: (query) => this.request('/agent-profiles', { query }),
            getProfile: (id) => this.request(`/agent-profiles/${id}`),
            createProfile: (body, options = {}) => this.request('/agent-profiles', { method: 'POST', body, ...options }),
            patchProfile: (id, body, options = {}) => this.request(`/agent-profiles/${id}`, { method: 'PATCH', body, ...options }),
            deleteProfile: (id) => this.request(`/agent-profiles/${id}`, { method: 'DELETE' }),
            duplicateProfile: (id) => this.request(`/agent-profiles/${id}/duplicate`, { method: 'POST' }),
            testProfile: (id, body = {}) => this.request(`/agent-profiles/${id}/test`, { method: 'POST', body }),

            // Skills
            listSkills: (query) => this.request('/skills', { query }),
            getSkill: (id) => this.request(`/skills/${id}`),
            createSkill: (body, options = {}) => this.request('/skills', { method: 'POST', body, ...options }),
            patchSkill: (id, body, options = {}) => this.request(`/skills/${id}`, { method: 'PATCH', body, ...options }),
            deleteSkill: (id) => this.request(`/skills/${id}`, { method: 'DELETE' }),
            testSkill: (id) => this.request(`/skills/${id}/test`, { method: 'POST' }),
            discoverSkills: () => this.request('/skills/discover', { method: 'POST' }),
            importSkill: (body) => this.request('/skills/import', { method: 'POST', body }),

            // Sessions & Tasks
            listSessions: (query) => this.request('/agent-sessions', { query }),
            createSession: (body, options = {}) => this.request('/agent-sessions', { method: 'POST', body, ...options }),
            getSession: (id) => this.request(`/agent-sessions/${id}`),
            listTasks: (query) => this.request('/agent-tasks', { query }),
            getTask: (id) => this.request(`/agent-tasks/${id}`),
            createTask: (body, options = {}) => {
                const idempotencyKey = options.idempotencyKey || this.generateIdempotencyKey();
                return this.request('/agent-tasks', { method: 'POST', body, idempotencyKey, ...options });
            },
            cancelTask: (id) => this.request(`/agent-tasks/${id}/cancel`, { method: 'POST' }),
            retryTask: (id, options = {}) => {
                const idempotencyKey = options.idempotencyKey || this.generateIdempotencyKey();
                return this.request(`/agent-tasks/${id}/retry`, { method: 'POST', idempotencyKey, ...options });
            },
            getTaskEvents: (id, query) => this.request(`/agent-tasks/${id}/events`, { query })
        };
    }

    get assets() {
        return {
            listAssets: (query) => this.request('/assets', { query }),
            getAsset: (id) => this.request(`/assets/${id}`),
            ingestAsset: (formData, options = {}) => this.request('/assets/ingest', { method: 'POST', body: formData, ...options }),
            trashAsset: (id) => this.request(`/assets/${id}/trash`, { method: 'POST' }),
            restoreAsset: (id) => this.request(`/assets/${id}/restore`, { method: 'POST' }),
            listTrash: (query) => this.request('/assets/trash', { query }),
            getAssetVersions: (id) => this.request(`/assets/${id}/versions`)
        };
    }

    get tasks() {
        return {
            listGenerationTasks: (query) => this.request('/generation-tasks', { query }),
            getGenerationTask: (id) => this.request(`/generation-tasks/${id}`),
            createGenerationTask: (body, options = {}) => {
                const idempotencyKey = options.idempotencyKey || this.generateIdempotencyKey();
                return this.request('/generation-tasks', { method: 'POST', body, idempotencyKey, ...options });
            },
            cancelGenerationTask: (id) => this.request(`/generation-tasks/${id}/cancel`, { method: 'POST' }),
            retryGenerationTask: (id, options = {}) => {
                const idempotencyKey = options.idempotencyKey || this.generateIdempotencyKey();
                return this.request(`/generation-tasks/${id}/retry`, { method: 'POST', idempotencyKey, ...options });
            }
        };
    }

    get bootstrap() {
        return {
            get: (query) => this.request('/bootstrap', { query })
        };
    }

    get runtimeCapabilities() {
        return {
            get: () => this.request('/runtime-capabilities')
        };
    }
}

export const v2ApiClient = new V2APIClient();

if (typeof window !== 'undefined') {
    window.v2ApiClient = v2ApiClient;
    window.V2APIClient = V2APIClient;
}
