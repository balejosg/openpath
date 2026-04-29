import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import process from 'node:process';
import { URL } from 'node:url';

import {
  buildAffectedTestPlan,
  buildMappedTestCommands,
  findMappedTests,
  groupTestsByWorkspace,
  parseTestFileMap,
  shouldUseWorkspaceFallback,
} from '../../scripts/affected-workspaces.js';

const fixtureMap = `
# comments and blank lines are ignored
firefox-extension/src/lib/background-runtime.ts|firefox-extension/tests/background-message-contracts.test.ts,firefox-extension/tests/background-message-handler.test.ts,firefox-extension/tests/native-host-contract.test.ts
react-spa/src/views/Users.tsx|react-spa/src/views/__tests__/Users.test.tsx
tests/selenium/student-policy-driver.ts|tests/selenium/student-policy-flow.test.ts
`;

test('parseTestFileMap maps one source file to one test', () => {
  const mappings = parseTestFileMap(
    'react-spa/src/views/Users.tsx|react-spa/src/views/__tests__/Users.test.tsx\n'
  );

  assert.deepEqual(mappings.get('react-spa/src/views/Users.tsx'), [
    'react-spa/src/views/__tests__/Users.test.tsx',
  ]);
});

test('findMappedTests maps one source file to several tests', () => {
  const mappings = parseTestFileMap(fixtureMap);

  assert.deepEqual(findMappedTests(['firefox-extension/src/lib/background-runtime.ts'], mappings), [
    'firefox-extension/tests/background-message-contracts.test.ts',
    'firefox-extension/tests/background-message-handler.test.ts',
    'firefox-extension/tests/native-host-contract.test.ts',
  ]);
});

test('findMappedTests returns no mapped tests for unknown source files', () => {
  const mappings = parseTestFileMap(fixtureMap);

  assert.deepEqual(findMappedTests(['firefox-extension/src/lib/unknown.ts'], mappings), []);
});

test('Selenium helper mapping keeps student policy flow test', () => {
  const mappings = parseTestFileMap(fixtureMap);

  assert.deepEqual(findMappedTests(['tests/selenium/student-policy-driver.ts'], mappings), [
    'tests/selenium/student-policy-flow.test.ts',
  ]);
});

test('global file changes force workspace fallback instead of exact test mode', () => {
  assert.equal(shouldUseWorkspaceFallback(['package.json']), true);
  assert.equal(
    shouldUseWorkspaceFallback(['firefox-extension/src/lib/background-runtime.ts']),
    false
  );
});

test('groupTestsByWorkspace groups mapped tests by npm workspace', () => {
  assert.deepEqual(
    groupTestsByWorkspace([
      'firefox-extension/tests/background-message-contracts.test.ts',
      'firefox-extension/tests/background-message-handler.test.ts',
      'api/tests/app.test.ts',
      'tests/selenium/student-policy-flow.test.ts',
    ]),
    new Map([
      [
        '@openpath/firefox-extension',
        [
          'firefox-extension/tests/background-message-contracts.test.ts',
          'firefox-extension/tests/background-message-handler.test.ts',
        ],
      ],
      ['@openpath/api', ['api/tests/app.test.ts']],
      ['root', ['tests/selenium/student-policy-flow.test.ts']],
    ])
  );
});

test('mapped Firefox extension files render exact runner command', () => {
  const commands = buildMappedTestCommands([
    'firefox-extension/tests/background-message-contracts.test.ts',
    'firefox-extension/tests/background-message-handler.test.ts',
    'firefox-extension/tests/native-host-contract.test.ts',
  ]);

  assert.deepEqual(commands, [
    {
      workspace: '@openpath/firefox-extension',
      tests: [
        'firefox-extension/tests/background-message-contracts.test.ts',
        'firefox-extension/tests/background-message-handler.test.ts',
        'firefox-extension/tests/native-host-contract.test.ts',
      ],
      command:
        'cd firefox-extension && npx tsx --test tests/background-message-contracts.test.ts tests/background-message-handler.test.ts tests/native-host-contract.test.ts',
    },
  ]);
});

test('--list-tests prints exact mapped tests before workspace fallback', () => {
  const result = spawnSync(process.execPath, ['scripts/affected-workspaces.js', '--list-tests'], {
    cwd: new URL('../..', import.meta.url),
    env: {
      ...process.env,
      OPENPATH_AFFECTED_FILES: 'firefox-extension/src/lib/background-runtime.ts',
    },
    encoding: 'utf-8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), [
    'firefox-extension/tests/background-message-contracts.test.ts',
    'firefox-extension/tests/background-message-handler.test.ts',
    'firefox-extension/tests/native-host-contract.test.ts',
  ]);
});

test('unmapped affected files keep workspace fallback beside mapped test commands', () => {
  const mappings = parseTestFileMap(fixtureMap);
  const plan = buildAffectedTestPlan(
    [
      'firefox-extension/src/lib/background-runtime.ts',
      'firefox-extension/src/lib/unmapped-runtime.ts',
    ],
    mappings
  );

  assert.deepEqual(
    plan.mappedCommands.map((command) => command.command),
    [
      'cd firefox-extension && npx tsx --test tests/background-message-contracts.test.ts tests/background-message-handler.test.ts tests/native-host-contract.test.ts',
    ]
  );
  assert.deepEqual(plan.fallbackWorkspaces, ['@openpath/firefox-extension']);
});
