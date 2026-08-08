import test from 'node:test';
import assert from 'node:assert/strict';
import { V2APIClient, ApiError, normalizeError } from '../v2-api-client.js';

test('normalizeError converts standard Error to ApiError', () => {
    const err = new Error('Network failure');
    const normalized = normalizeError(err, 500);
    assert.ok(normalized instanceof ApiError);
    assert.equal(normalized.message, 'Network failure');
    assert.equal(normalized.code, 'INTERNAL_ERROR');
    assert.equal(normalized.retryable, false);
});

test('V2APIClient appends query parameters correctly', async () => {
    let requestedUrl = '';
    const mockFetch = async (url) => {
        requestedUrl = url;
        return {
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'application/json']]),
            json: async () => ({ items: [] })
        };
    };

    const client = new V2APIClient({ fetchFn: mockFetch });
    await client.agents.listRuntimes({ status: 'ready', limit: 10 });
    assert.equal(requestedUrl, '/api/v2/agent-runtimes?status=ready&limit=10');
});

test('V2APIClient handles problem+json errors', async () => {
    const mockFetch = async () => ({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        headers: new Map([
            ['content-type', 'application/problem+json'],
            ['x-request-id', 'req_abc123']
        ]),
        json: async () => ({
            type: '/problems/agent-runtime-in-use',
            title: 'Runtime in use',
            status: 409,
            detail: 'Cannot delete runtime bound to agent',
            code: 'AGENT_RUNTIME_IN_USE',
            retryable: false
        })
    });

    const client = new V2APIClient({ fetchFn: mockFetch });
    await assert.rejects(
        async () => {
            await client.agents.deleteRuntime('rtp_123');
        },
        (err) => {
            assert.ok(err instanceof ApiError);
            assert.equal(err.code, 'AGENT_RUNTIME_IN_USE');
            assert.equal(err.status, 409);
            assert.equal(err.requestId, 'req_abc123');
            assert.equal(err.retryable, false);
            return true;
        }
    );
});

test('V2APIClient adds Idempotency-Key header on task creation', async () => {
    let capturedHeaders = {};
    const mockFetch = async (url, options) => {
        capturedHeaders = options.headers;
        return {
            ok: true,
            status: 201,
            headers: new Map([['content-type', 'application/json']]),
            json: async () => ({ task: { id: 'tsk_123' } })
        };
    };

    const client = new V2APIClient({ fetchFn: mockFetch });
    await client.agents.createTask({ instruction: 'Hello Agent' }, { idempotencyKey: 'test_key_001' });

    assert.equal(capturedHeaders['Idempotency-Key'], 'test_key_001');
    assert.equal(capturedHeaders['Content-Type'], 'application/json');
});

test('V2APIClient does not override Content-Type for FormData', async () => {
    let capturedHeaders = {};
    let capturedBody = null;
    const mockFetch = async (url, options) => {
        capturedHeaders = options.headers;
        capturedBody = options.body;
        return {
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'application/json']]),
            json: async () => ({ asset: { id: 'ast_123' } })
        };
    };

    const client = new V2APIClient({ fetchFn: mockFetch });
    class FakeFormData {
        append() {}
    }
    const formData = new FakeFormData();
    await client.assets.ingestAsset(formData);

    assert.equal(capturedHeaders['Content-Type'], undefined);
    assert.equal(capturedBody, formData);
});

test('V2APIClient timeout creates timeout ApiError', async () => {
    const mockFetch = async (url, options) => {
        return new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
            });
        });
    };

    const client = new V2APIClient({ fetchFn: mockFetch, defaultTimeout: 50 });
    await assert.rejects(
        async () => {
            await client.bootstrap.get();
        },
        (err) => {
            assert.ok(err instanceof ApiError);
            assert.equal(err.code, 'TIMEOUT');
            assert.equal(err.status, 408);
            return true;
        }
    );
});
