import { test, describe } from 'node:test';
import assert from 'node:assert';
import express from 'express';

import { registerPublicRequestRoutes } from '../../src/routes/public-requests.js';

void describe('public-requests routes', () => {
  void test('registerPublicRequestRoutes registers handlers without throwing', async () => {
    const app = express();
    app.use(express.json());
    registerPublicRequestRoutes(app);

    const server = app.listen(0);
    const address = server.address();

    try {
      assert.ok(address !== null);
      assert.strictEqual(typeof address, 'object');
      const port = (address as { port: number }).port;
      const baseUrl = `http://localhost:${String(port)}`;

      const response = await fetch(`${baseUrl}/api/requests/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(response.status, 400);
      const payload = (await response.json()) as { success: boolean; error?: string };
      assert.strictEqual(payload.success, false);
      assert.ok((payload.error ?? '').length > 0);
    } finally {
      server.close();
    }
  });
});
