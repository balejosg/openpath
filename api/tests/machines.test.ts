import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';

function getRegisteredRoutes(app: express.Express): string[] {
  return (app.router.stack as { route?: { path: string; methods: Record<string, boolean> } }[])
    .filter((layer) => layer.route)
    .flatMap((layer) =>
      Object.keys(layer.route?.methods ?? {}).map(
        (method) => `${method.toUpperCase()} ${layer.route?.path ?? ''}`
      )
    );
}

await describe('machine routes', async () => {
  await test('registers machine enrollment, package, whitelist, and event endpoints', async () => {
    const { registerMachineRoutes } = await import('../src/routes/machines.js');

    const app = express();
    registerMachineRoutes(app, {
      getCurrentEvaluationTime: () => new Date('2026-04-01T00:00:00Z'),
    });

    const routes = getRegisteredRoutes(app);
    assert.deepEqual(
      routes.filter(
        (route) =>
          route.startsWith('GET /api/agent') ||
          route.startsWith('POST /api/machines') ||
          route.startsWith('GET /w/') ||
          route === 'GET /api/machines/events'
      ),
      [
        'POST /api/machines/register',
        'POST /api/machines/:hostname/rotate-download-token',
        'GET /api/agent/windows/bootstrap/latest.json',
        'GET /api/agent/windows/bootstrap/file',
        'GET /api/agent/windows/latest.json',
        'GET /api/agent/windows/file',
        'GET /api/agent/linux/latest.json',
        'GET /api/agent/linux/package',
        'GET /w/whitelist.txt',
        'GET /w/:machineToken/whitelist.txt',
        'GET /api/machines/events',
      ]
    );
  });
});
