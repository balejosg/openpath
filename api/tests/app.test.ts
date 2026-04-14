import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { loadConfig, setConfigForTests } from '../src/config.js';

void test('createApp returns an express app without opening sockets', async () => {
  const testConfig = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    JWT_SECRET: 'app-test-secret',
    ENABLE_SWAGGER: 'false',
  });
  setConfigForTests(testConfig);

  const { app } = await createApp(testConfig);

  assert.equal(typeof app.listen, 'function');
});
