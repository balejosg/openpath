import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

type FetchCall = {
  pathname: string;
  authorization: string | null;
};

const originalFetch = globalThis.fetch;

let fetchCalls: FetchCall[] = [];

function getRequestUrl(input: Parameters<typeof fetch>[0]): URL {
  if (typeof input === 'string') {
    return new URL(input);
  }
  if (input instanceof URL) {
    return input;
  }
  return new URL(input.url);
}

function getAuthorizationHeader(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get('Authorization');
}

function trpcResponse(data: unknown): Response {
  return new Response(JSON.stringify([{ result: { data } }]), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}

beforeEach(() => {
  fetchCalls = [];
  process.env.API_URL = 'http://dashboard.test';
  globalThis.fetch = (async (input, init) => {
    const url = getRequestUrl(input);
    fetchCalls.push({
      pathname: url.pathname,
      authorization: getAuthorizationHeader(init),
    });

    switch (url.pathname) {
      case '/trpc/auth.login':
        return trpcResponse({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          user: { id: 'user-1', email: 'teacher@dashboard.local', name: 'Teacher Dashboard' },
        });
      case '/trpc/auth.refresh':
        return trpcResponse({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token' });
      case '/trpc/auth.logout':
        return trpcResponse({ success: true });
      case '/trpc/groups.list':
        return trpcResponse([
          {
            id: 'group-1',
            name: 'teachers',
            displayName: 'Teachers',
            enabled: true,
            whitelistCount: 2,
            blockedSubdomainCount: 1,
            blockedPathCount: 0,
          },
        ]);
      case '/trpc/groups.getById':
        return trpcResponse({ id: 'group-1', name: 'teachers', displayName: 'Teachers' });
      case '/trpc/groups.getByName':
        return trpcResponse({ id: 'group-1', name: 'teachers', displayName: 'Teachers' });
      case '/trpc/groups.create':
        return trpcResponse({ id: 'group-2', name: 'new-group' });
      case '/trpc/groups.update':
        return trpcResponse({ id: 'group-1', name: 'teachers', displayName: 'Updated Teachers' });
      case '/trpc/groups.delete':
        return trpcResponse({ deleted: true });
      case '/trpc/groups.listRules':
        return trpcResponse([
          { id: 'rule-1', groupId: 'group-1', type: 'whitelist', value: 'example.com' },
        ]);
      case '/trpc/groups.createRule':
        return trpcResponse({ id: 'rule-2' });
      case '/trpc/groups.deleteRule':
        return trpcResponse({ deleted: true });
      case '/trpc/groups.bulkCreateRules':
        return trpcResponse({ count: 2 });
      case '/trpc/groups.stats':
        return trpcResponse({ groupCount: 3, whitelistCount: 10, blockedCount: 4 });
      case '/trpc/groups.systemStatus':
        return trpcResponse({ enabled: true, totalGroups: 3, activeGroups: 2, pausedGroups: 1 });
      case '/trpc/groups.toggleSystem':
        return trpcResponse({ enabled: false, totalGroups: 3, activeGroups: 0, pausedGroups: 3 });
      case '/trpc/groups.export':
        return trpcResponse({ name: 'teachers', content: 'example.com' });
      case '/trpc/groups.exportAll':
        return trpcResponse([{ name: 'teachers', content: 'example.com' }]);
      default:
        throw new Error(`Unexpected tRPC request: ${url.pathname}`);
    }
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.API_URL;
});

describe('dashboard tRPC client wrappers', async () => {
  await it('wraps authenticated group operations', async () => {
    const tag = `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const { createApiClient } = await import(`../src/api-client.ts?${tag}`);

    const client = createApiClient('Bearer-Token');

    assert.deepStrictEqual(await client.getAllGroups(), [
      {
        id: 'group-1',
        name: 'teachers',
        displayName: 'Teachers',
        enabled: true,
        whitelistCount: 2,
        blockedSubdomainCount: 1,
        blockedPathCount: 0,
      },
    ]);
    assert.deepStrictEqual(await client.getGroupById('group-1'), {
      id: 'group-1',
      name: 'teachers',
      displayName: 'Teachers',
    });
    assert.deepStrictEqual(await client.getGroupByName('teachers'), {
      id: 'group-1',
      name: 'teachers',
      displayName: 'Teachers',
    });
    assert.deepStrictEqual(await client.createGroup('new-group', 'New Group'), {
      id: 'group-2',
      name: 'new-group',
    });
    assert.deepStrictEqual(await client.updateGroup('group-1', 'Updated Teachers', true), {
      id: 'group-1',
      name: 'teachers',
      displayName: 'Updated Teachers',
    });
    assert.strictEqual(await client.deleteGroup('group-1'), true);
    assert.deepStrictEqual(await client.getRulesByGroup('group-1'), [
      { id: 'rule-1', groupId: 'group-1', type: 'whitelist', value: 'example.com' },
    ]);
    assert.deepStrictEqual(await client.createRule('group-1', 'whitelist', 'example.com'), {
      id: 'rule-2',
    });
    assert.strictEqual(await client.deleteRule('rule-1'), true);
    assert.strictEqual(
      await client.bulkCreateRules('group-1', 'whitelist', ['a.example.com', 'b.example.com']),
      2
    );
    assert.deepStrictEqual(await client.getStats(), {
      groupCount: 3,
      whitelistCount: 10,
      blockedCount: 4,
    });
    assert.deepStrictEqual(await client.getSystemStatus(), {
      enabled: true,
      totalGroups: 3,
      activeGroups: 2,
      pausedGroups: 1,
    });
    assert.deepStrictEqual(await client.toggleSystemStatus(false), {
      enabled: false,
      totalGroups: 3,
      activeGroups: 0,
      pausedGroups: 3,
    });
    assert.deepStrictEqual(await client.exportGroup('group-1'), {
      name: 'teachers',
      content: 'example.com',
    });
    assert.deepStrictEqual(await client.exportAllGroups(), [
      { name: 'teachers', content: 'example.com' },
    ]);

    assert.ok(fetchCalls.length >= 15);
    assert.ok(fetchCalls.every((call) => call.authorization === 'Bearer Bearer-Token'));
  });

  await it('wraps public authentication operations and helpers', async () => {
    const tag = `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const clientModule = await import(`../src/api-client.ts?${tag}`);
    const trpcModule = await import(`../src/trpc.ts?${tag}`);

    assert.deepStrictEqual(await clientModule.login('teacher', 'Password123!'), {
      success: true,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: 'user-1',
        email: 'teacher@dashboard.local',
        name: 'Teacher Dashboard',
      },
    });
    assert.deepStrictEqual(await clientModule.refreshToken('refresh-token'), {
      success: true,
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    assert.strictEqual(await clientModule.logout('Bearer-Token', 'refresh-token'), true);

    const authCalls = fetchCalls.filter((call) => call.pathname.startsWith('/trpc/auth.'));
    assert.strictEqual(authCalls[0]?.authorization, null);
    assert.strictEqual(authCalls[1]?.authorization, null);
    assert.strictEqual(authCalls[2]?.authorization, 'Bearer Bearer-Token');

    assert.strictEqual(trpcModule.getTRPCErrorCode(new Error('boom')), undefined);
    assert.strictEqual(trpcModule.getTRPCErrorMessage(new Error('boom')), 'boom');
    assert.strictEqual(trpcModule.getTRPCErrorStatus(new Error('boom')), 500);
    assert.strictEqual(trpcModule.API_URL, 'http://dashboard.test');
  });
});
