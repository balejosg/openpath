import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import { getAvailablePort, resetDb, trpcMutate as _trpcMutate, parseTRPC } from './test-utils.js';
import { closeConnection, db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

let PORT: number;
let API_URL: string;
let server: Server | undefined;

let teacherAccessToken: string;
let classroomId: string;
let teacherEmail: string;
const TEACHER_GROUP_ID = 'test-group';

const trpcMutate = (
  procedure: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<Response> => _trpcMutate(API_URL, procedure, input, headers);

async function ensureGroupExists(groupId: string): Promise<void> {
  await db.execute(
    sql.raw(`
      INSERT INTO whitelist_groups (id, name, display_name) VALUES ('${groupId}', '${groupId}', '${groupId}')
      ON CONFLICT (id) DO NOTHING
    `)
  );
}

async function createTestClassroom(name: string, groupId: string): Promise<string> {
  await ensureGroupExists(groupId);
  const id = `room_${String(Date.now())}`;
  await db.execute(
    sql.raw(`
      INSERT INTO classrooms (id, name, display_name, default_group_id, active_group_id)
      VALUES ('${id}', '${name}', '${name}', '${groupId}', '${groupId}')
    `)
  );
  return id;
}

void describe('Enrollment API (secure tickets)', { timeout: 30000 }, async () => {
  before(async () => {
    await resetDb();

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);

    const { app } = await import('../src/server.js');
    server = app.listen(PORT, () => {
      console.log(`Enrollment test server started on port ${String(PORT)}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create a teacher user and login
    const email = `enroll-teacher-${String(Date.now())}@example.com`;
    const password = 'SecurePassword123!';
    teacherEmail = email.toLowerCase();

    const registerRes = await trpcMutate('auth.register', {
      email,
      password,
      name: 'Enroll Teacher',
    });
    assert.strictEqual(registerRes.status, 200);

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
    classroomId = await createTestClassroom('testclassroom', TEACHER_GROUP_ID);
  });

  after(async () => {
    await resetDb();

    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          resolve();
        });
      });
    }
    await closeConnection();
  });

  await test('POST /api/enroll/:classroomId/ticket requires auth', async () => {
    const res = await fetch(`${API_URL}/api/enroll/${classroomId}/ticket`, { method: 'POST' });
    assert.strictEqual(res.status, 401);
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
