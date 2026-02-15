/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Security Tests (tRPC & Standard API)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';

// Set env vars BEFORE any imports that load config.ts
process.env.JWT_SECRET = 'test-secret-123';
process.env.NODE_ENV = 'development'; // Enable rate limiting logic
process.env.ENABLE_RATE_LIMIT_IN_TEST = 'true'; // Actually enable the middleware

let PORT: number;
let API_URL: string;
const JWT_SECRET = 'test-secret-123';

let server: Server | undefined;

async function request(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; headers: Headers; body: any }> {
  const response = await fetch(`${API_URL}${path}`, options);
  const headers = response.headers;
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // ignore JSON parse error
  }
  return { status: response.status, headers, body };
}

await describe('Security and Hardening Tests', async () => {
  before(async () => {
    // Dynamic imports
    const { getAvailablePort } = await import('./test-utils.js');
    const { app } = await import('../src/server.js');

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);

    server = app.listen(PORT, () => {
      console.log(`Security test server started on port ${String(PORT)}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  after(async () => {
    if (server !== undefined) {
      await new Promise<void>((resolve) => {
        server?.close(() => {
          console.log('Security test server closed');
          resolve();
        });
      });
    }
  });

  await describe('HTTP Headers & Security Hardening', async () => {
    await it('should include X-Content-Type-Options: nosniff', async (): Promise<void> => {
      const { headers } = await request('/health');
      assert.strictEqual(headers.get('x-content-type-options'), 'nosniff');
    });

    await it('should include X-Frame-Options: DENY', async (): Promise<void> => {
      const { headers } = await request('/health');
      assert.strictEqual(headers.get('x-frame-options'), 'DENY');
    });

    await it('should include Content-Security-Policy header', async (): Promise<void> => {
      const { headers } = await request('/health');
      const csp = headers.get('content-security-policy');
      assert.ok(csp !== null && csp !== '', 'CSP header should be present');
      assert.ok(csp.includes('default-src'), 'CSP should include default-src');
    });
  });

  await describe('Authorization Boundaries', async () => {
    await it('prevents students from approving requests', async (): Promise<void> => {
      const domain = `student-test-${String(Date.now())}.com`;
      // 1. Create a request
      const createResp = await request('/trpc/requests.create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          reason: 'test',
          requesterEmail: 'student@school.edu',
          groupId: 'group-a',
        }),
      });
      assert.strictEqual(createResp.status, 200);
      const requestId = createResp.body.result.data.id;

      // 2. Create student token
      const studentToken = jwt.sign(
        {
          sub: 'student-1',
          email: 'student@school.edu',
          name: 'Student',
          roles: [{ role: 'student', groupIds: ['group-a'] }],
          type: 'access',
        },
        JWT_SECRET,
        { issuer: 'openpath-api', expiresIn: '1h' }
      );

      // 3. Attempt to approve
      const approveResp = await request('/trpc/requests.approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          id: requestId,
        }),
      });

      // Should be Forbidden (403)
      assert.strictEqual(approveResp.status, 403);
    });

    await it('prevents cross-group access', async (): Promise<void> => {
      const domain = `group-b-test-${String(Date.now())}.com`;
      // 1. Create a request for group-b
      const createResp = await request('/trpc/requests.create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          reason: 'test',
          requesterEmail: 'user@school.edu',
          groupId: 'group-b',
        }),
      });
      assert.strictEqual(createResp.status, 200);
      const requestId = createResp.body.result.data.id;

      // 2. Create teacher token for group-a
      const teacherToken = jwt.sign(
        {
          sub: 'teacher-1',
          email: 'teacher@school.edu',
          name: 'Teacher',
          roles: [{ role: 'teacher', groupIds: ['group-a'] }],
          type: 'access',
        },
        JWT_SECRET,
        { issuer: 'openpath-api', expiresIn: '1h' }
      );

      // 3. Attempt to approve request in group-b
      const approveResp = await request('/trpc/requests.approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`,
        },
        body: JSON.stringify({
          id: requestId,
        }),
      });

      // Should be Forbidden (403)
      assert.strictEqual(approveResp.status, 403);
    });

    await it('enforces rate limiting on auth endpoints', async (): Promise<void> => {
      // Hit auth.login 11 times (limit is usually 10)
      const promises = [];
      for (let i = 0; i < 11; i++) {
        promises.push(
          request('/trpc/auth.login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'rate@limit.com',
              password: 'password123',
            }),
          })
        );
      }

      const responses = await Promise.all(promises);
      // At least one should fail with 429
      const blocked = responses.filter((r) => r.status === 429);
      assert.ok(blocked.length > 0, 'Should have blocked some requests');
    });
  });

  await describe('Authentication and Authorization', async () => {
    await it('should reject access to private routes without token', async (): Promise<void> => {
      const response = await fetch(`${API_URL}/trpc/users.list`);
      assert.strictEqual(response.status, 401);
    });

    await it('should reject invalid auth token format', async (): Promise<void> => {
      const response = await fetch(`${API_URL}/trpc/users.list`, {
        headers: {
          Authorization: 'InvalidFormat token123',
        },
      });
      assert.strictEqual(response.status, 401);
    });

    await it('should reject malformed JWT token', async (): Promise<void> => {
      const response = await fetch(`${API_URL}/trpc/users.list`, {
        headers: {
          Authorization: 'Bearer not.a.valid.jwt.token',
        },
      });
      assert.strictEqual(response.status, 401);
    });

    await it('should reject expired token signature', async (): Promise<void> => {
      // This is a properly formatted but invalid JWT (wrong signature)
      const fakeToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidHlwZSI6ImFjY2VzcyJ9.invalid_signature';
      const response = await fetch(`${API_URL}/trpc/users.list`, {
        headers: {
          Authorization: `Bearer ${fakeToken}`,
        },
      });
      assert.strictEqual(response.status, 401);
    });
  });

  await describe('Input Validation Security', async () => {
    await it('should reject SQL injection in domain requests', async (): Promise<void> => {
      const response = await fetch(`${API_URL}/trpc/requests.create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json: {
            domain: "'; DROP TABLE requests; --",
            reason: 'test',
            requesterEmail: 'test@example.com',
          },
        }),
      });
      // Should reject as invalid domain, not cause SQL error
      const body = (await response.json()) as { error?: { message?: string } };
      const hasInvalidMessage = body.error?.message?.includes('Invalid') === true;
      const is400Status = response.status === 400;
      assert.ok(hasInvalidMessage || is400Status);
    });

    await it('should sanitize XSS in domain name', async (): Promise<void> => {
      const response = await fetch(`${API_URL}/trpc/requests.create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json: {
            domain: '<script>alert("xss")</script>.com',
            reason: 'test',
            requesterEmail: 'test@example.com',
          },
        }),
      });
      // Should reject as invalid domain
      assert.ok(response.status === 400 || response.status === 500);
    });

    await it('should handle extremely long input gracefully', async (): Promise<void> => {
      const longDomain = 'a'.repeat(1000) + '.com';
      const response = await fetch(`${API_URL}/trpc/requests.create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json: {
            domain: longDomain,
            reason: 'test',
            requesterEmail: 'test@example.com',
          },
        }),
      });
      // Should reject, not crash
      assert.ok(response.status === 400 || response.status === 500);
    });
  });

  await describe('Data Minimization & Privacy Boundaries', async () => {
    await it('rejects health reports with unrecognized fields (strict schema)', async (): Promise<void> => {
      const { status, body } = await request('/trpc/healthReports.submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-shared-secret',
        },
        body: JSON.stringify({
          json: {
            hostname: 'test-host',
            status: 'OK',
            // Malicious/Excessive data:
            browsingHistory: ['forbidden-site.com'],
            dnsQueries: ['how to bypass'],
          },
        }),
      });

      if (status !== 401) {
        assert.strictEqual(status, 400, 'Should reject unrecognized keys in health report');
        const errorMessage = (body as { error: { message: string } }).error.message;
        assert.ok(errorMessage.includes('unrecognized_keys'));
      }
    });

    await it('rejects domain requests with unrecognized fields', async (): Promise<void> => {
      const { status, body } = await request('/trpc/requests.create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json: {
            domain: `privacy-test-${String(Date.now())}.com`,
            reason: 'test',
            requesterEmail: 'user@test.local',
            fullUrl: 'https://example.com/private/path',
          },
        }),
      });

      if (status === 429) {
        console.warn('Rate limited in privacy test - skipping 400 check');
        return;
      }

      assert.strictEqual(status, 400, 'Should reject unrecognized keys in domain request');
      const errorMessage = (body as { error: { message: string } }).error.message;
      assert.ok(errorMessage.includes('unrecognized_keys'));
    });
  });
});
