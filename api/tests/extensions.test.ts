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

await describe('extension routes', async () => {
  await test('registers Firefox and Chromium distribution endpoints', async () => {
    const { registerExtensionRoutes } = await import('../src/routes/extensions.js');

    const app = express();
    registerExtensionRoutes(app);

    const routes = getRegisteredRoutes(app);
    assert.ok(routes.includes('GET /api/extensions/firefox/openpath.xpi'));
    assert.ok(routes.includes('GET /api/extensions/chromium/updates.xml'));
    assert.ok(routes.includes('GET /api/extensions/chromium/openpath.crx'));
  });
});
