import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, it } from 'node:test';

const ORIGINAL_ENV = {
  CORS_ORIGINS: process.env.CORS_ORIGINS,
  JWT_SECRET: process.env.JWT_SECRET,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  restoreEnvVar('JWT_SECRET', ORIGINAL_ENV.JWT_SECRET);
  restoreEnvVar('NODE_ENV', ORIGINAL_ENV.NODE_ENV);
  restoreEnvVar('CORS_ORIGINS', ORIGINAL_ENV.CORS_ORIGINS);
});

function restoreEnvVar(
  name: 'CORS_ORIGINS' | 'JWT_SECRET' | 'NODE_ENV',
  value: string | undefined
): void {
  if (value !== undefined) {
    process.env[name] = value;
    return;
  }

  Reflect.deleteProperty(process.env, name);
}

function freshTag(): string {
  return `${String(Date.now())}-${Math.random().toString(16).slice(2)}`;
}

function importAuthInSubprocess(
  env: Record<string, string | undefined>
): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      "try { const mod = await import('./src/lib/auth.ts'); console.log(mod.JWT_SECRET); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      encoding: 'utf8',
    }
  );
}

await describe('jwt secret configuration', async () => {
  await it('rejects missing JWT_SECRET outside explicit test mode', async () => {
    const { loadConfig } = (await import(
      `../src/config.ts?${freshTag()}`
    )) as typeof import('../src/config.js');

    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: 'development',
        }),
      /JWT_SECRET/i
    );

    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: 'production',
        }),
      /JWT_SECRET/i
    );
  });

  await it('rejects the built-in development secret outside explicit test mode', async () => {
    const { loadConfig } = (await import(
      `../src/config.ts?${freshTag()}`
    )) as typeof import('../src/config.js');

    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: 'development',
          JWT_SECRET: 'openpath-dev-secret-change-in-production',
        }),
      /default/i
    );
  });

  await it('only allows the fallback secret path in NODE_ENV=test', () => {
    const developmentImport = importAuthInSubprocess({
      NODE_ENV: 'development',
      JWT_SECRET: undefined,
    });
    assert.notStrictEqual(developmentImport.status, 0);

    const testImport = importAuthInSubprocess({
      NODE_ENV: 'test',
      JWT_SECRET: undefined,
    });
    assert.strictEqual(testImport.status, 0, String(testImport.stderr));
  });

  await it('rejects wildcard CORS_ORIGINS in production', async () => {
    const { loadConfig } = (await import(
      `../src/config.ts?${freshTag()}`
    )) as typeof import('../src/config.js');

    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: 'production',
          JWT_SECRET: 'production-secret',
          CORS_ORIGINS: '*',
        }),
      /CORS_ORIGINS/i
    );
  });
});
