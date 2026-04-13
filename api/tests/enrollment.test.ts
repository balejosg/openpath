import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { trpcMutate as _trpcMutate, parseTRPC, registerAndVerifyUser } from './test-utils.js';
import { startHttpTestHarness } from './http-test-harness.js';
import { CANONICAL_GROUP_IDS, createFixtureClassroom } from './fixtures.js';
import { db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

let API_URL: string;
let harness: Awaited<ReturnType<typeof startHttpTestHarness>> | undefined;

let teacherAccessToken: string;
let classroomId: string;
let teacherEmail: string;
const TEACHER_GROUP_ID = CANONICAL_GROUP_IDS.testGroup;

const trpcMutate = (
  procedure: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<Response> => _trpcMutate(API_URL, procedure, input, headers);

void describe('Enrollment API (secure tickets)', { timeout: 30000 }, async () => {
  before(async () => {
    harness = await startHttpTestHarness({
      readyDelayMs: 1000,
      resetDb: true,
    });
    API_URL = harness.apiUrl;

    // Create a teacher user and login
    const email = `enroll-teacher-${String(Date.now())}@example.com`;
    const password = 'SecurePassword123!';
    teacherEmail = email.toLowerCase();

    const { registerResponse, verifyResponse } = await registerAndVerifyUser(API_URL, {
      email,
      password,
      name: 'Enroll Teacher',
    });
    assert.strictEqual(registerResponse.status, 200);
    assert.strictEqual(verifyResponse?.status, 200);

    const loginRes = await trpcMutate('auth.login', { email, password });
    assert.strictEqual(loginRes.status, 200);
    const loginParsed = await parseTRPC(loginRes);
    const loginData = loginParsed.data as { accessToken?: string };
    assert.ok(loginData.accessToken);
    teacherAccessToken = loginData.accessToken;

    // Promote to teacher role (direct DB for test setup)
    // Note: access token embeds roles at issuance, so we must login AFTER role assignment.
    await db.execute(
      sql.raw(`
        INSERT INTO roles (id, user_id, role, group_ids)
        VALUES ('role_teacher_${String(Date.now())}', (SELECT id FROM users WHERE email='${teacherEmail}'), 'teacher', ARRAY['${TEACHER_GROUP_ID}']::text[])
        ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, group_ids = EXCLUDED.group_ids
      `)
    );

    const loginRes2 = await trpcMutate('auth.login', { email, password });
    assert.strictEqual(loginRes2.status, 200);
    const loginParsed2 = await parseTRPC(loginRes2);
    const loginData2 = loginParsed2.data as { accessToken?: string };
    assert.ok(loginData2.accessToken);
    teacherAccessToken = loginData2.accessToken;

    // Create classroom
    classroomId = await createFixtureClassroom({
      name: 'testclassroom',
      displayName: 'testclassroom',
      groupId: TEACHER_GROUP_ID,
      id: `room_${String(Date.now())}`,
    });
  });

  after(async () => {
    if (harness !== undefined) {
      await harness.close();
    }
  });

  await test('POST /api/enroll/:classroomId/ticket requires auth', async () => {
    const res = await fetch(`${API_URL}/api/enroll/${classroomId}/ticket`, { method: 'POST' });
    assert.strictEqual(res.status, 401);
  });

  await test('POST /api/enroll/:classroomId/ticket rejects legacy ADMIN_TOKEN bearer auth', async () => {
    const previousAdminToken = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = 'legacy-admin-token';

    try {
      const res = await fetch(`${API_URL}/api/enroll/${classroomId}/ticket`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer legacy-admin-token',
        },
      });

      assert.strictEqual(res.status, 401);
    } finally {
      if (previousAdminToken === undefined) {
        delete process.env.ADMIN_TOKEN;
      } else {
        process.env.ADMIN_TOKEN = previousAdminToken;
      }
    }
  });

  await test('POST /api/enroll/:classroomId/ticket accepts cookie auth when configured', async () => {
    const prev = process.env.OPENPATH_ACCESS_TOKEN_COOKIE_NAME;
    const cookieName = 'test_access_cookie';
    process.env.OPENPATH_ACCESS_TOKEN_COOKIE_NAME = cookieName;

    try {
      const res = await fetch(`${API_URL}/api/enroll/${classroomId}/ticket`, {
        method: 'POST',
        headers: {
          Cookie: `${cookieName}=${teacherAccessToken}`,
          Origin: API_URL,
        },
      });

      assert.strictEqual(res.status, 200);
      const data = (await res.json()) as { success: boolean; enrollmentToken?: string };
      assert.strictEqual(data.success, true);
      assert.ok(data.enrollmentToken);
    } finally {
      if (prev === undefined) {
        delete process.env.OPENPATH_ACCESS_TOKEN_COOKIE_NAME;
      } else {
        process.env.OPENPATH_ACCESS_TOKEN_COOKIE_NAME = prev;
      }
    }
  });

  await test('POST /api/enroll/:classroomId/ticket returns enrollment token for teacher', async () => {
    const res = await fetch(`${API_URL}/api/enroll/${classroomId}/ticket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAccessToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as { success: boolean; enrollmentToken?: string };
    assert.strictEqual(data.success, true);
    assert.ok(data.enrollmentToken);
  });

  await test('GET /api/enroll/:classroomId returns script when authorized with enrollment token', async () => {
    const ticketRes = await fetch(`${API_URL}/api/enroll/${classroomId}/ticket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAccessToken}` },
    });
    assert.strictEqual(ticketRes.status, 200);
    const ticketData = (await ticketRes.json()) as { success: boolean; enrollmentToken: string };
    assert.ok(ticketData.enrollmentToken);

    const res = await fetch(`${API_URL}/api/enroll/${classroomId}`, {
      headers: { Authorization: `Bearer ${ticketData.enrollmentToken}` },
    });

    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/x-shellscript/);
    assert.strictEqual(res.headers.get('cache-control'), 'no-store, max-age=0');

    const body = await res.text();
    assert.match(body, /#!\/bin\/bash/);
    assert.match(body, /apt-bootstrap\.sh/);
    assert.match(body, /--enrollment-token/);
    assert.doesNotMatch(body, /\?token=/);
  });

  await test('GET /api/enroll/:classroomId rejects missing auth', async () => {
    const res = await fetch(`${API_URL}/api/enroll/${classroomId}`);
    assert.strictEqual(res.status, 401);
  });
});
