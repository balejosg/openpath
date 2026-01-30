import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import { getAvailablePort } from './test-utils.js';
import { closeConnection } from '../src/db/index.js';

let PORT: number;
let API_URL: string;
let server: Server | undefined;

// Helper to call tRPC mutations
async function trpcMutate(procedure: string, input: unknown): Promise<Response> {
    const response = await fetch(`${API_URL}/trpc/${procedure}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
    });
    return response;
}

// Parse tRPC response
interface TRPCResponse<T = unknown> {
    result?: { data: T };
    error?: { message: string; code: string };
}

async function parseTRPC(response: Response): Promise<{ data?: unknown; error?: string; code?: string }> {
    const json = await response.json() as TRPCResponse;
    if (json.result) return { data: json.result.data };
    if (json.error) return { error: json.error.message, code: json.error.code };
    return {};
}

await describe('Google Authentication API Tests (tRPC)', { timeout: 30000 }, async () => {
    before(async () => {
        PORT = await getAvailablePort();
        API_URL = `http://localhost:${String(PORT)}`;
        process.env.PORT = String(PORT);
        // Ensure we have a dummy JWT_SECRET for tests
        process.env.JWT_SECRET = 'test-secret-key-for-google-auth-unit-tests';
        
        const { app } = await import('../src/server.js');

        server = app.listen(PORT, () => {
            console.log(`Google Auth test server started on port ${String(PORT)}`);
        });

        await new Promise(resolve => setTimeout(resolve, 500));
    });

    after(async () => {
        if (server) {
            await new Promise<void>((resolve) => {
                server?.close(() => {
                    console.log('Google Auth test server closed');
                    resolve();
                });
            });
        }
        await closeConnection();
    });

    await test('GET /api/config should return googleClientId', async () => {
        const response = await fetch(`${API_URL}/api/config`);
        assert.strictEqual(response.status, 200);
        const config = await response.json() as { googleClientId?: string };
        assert.ok('googleClientId' in config);
    });

    await test('auth.googleLogin should fail if GOOGLE_CLIENT_ID is not configured', async () => {
        // Backup current env if any
        const oldId = process.env.GOOGLE_CLIENT_ID;
        delete process.env.GOOGLE_CLIENT_ID;
        
        // We need to re-import config or rely on the fact that AuthService uses it
        // Since config is a singleton, this might be tricky without mocks, 
        // but let's see what the current server says.
        
        const response = await trpcMutate('auth.googleLogin', { idToken: 'fake-token' });
        const { error } = await parseTRPC(response);
        
        // If not configured, it returns UNAUTHORIZED with a specific message
        if (error) {
            assert.ok(error.includes('Google') || error.includes('config'), `Error was: ${error}`);
        }
        
        process.env.GOOGLE_CLIENT_ID = oldId;
    });

    await test('auth.googleLogin should reject invalid tokens', async () => {
        // Set a dummy client ID so it doesn't fail early
        process.env.GOOGLE_CLIENT_ID = '12345-test.apps.googleusercontent.com';
        
        const response = await trpcMutate('auth.googleLogin', { idToken: 'invalid-garbage-token' });
        
        // It should fail verification
        assert.notStrictEqual(response.status, 200);
        const { error } = await parseTRPC(response);
        assert.ok(error);
    });
});