import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { reconcileStudentScenario } from './reconcile-student-scenario.js';

await test('reconcileStudentScenario updates machine whitelistUrl and token from installed client config', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpath-student-scenario-'));
  const scenarioPath = path.join(tempDir, 'student-scenario.json');
  const whitelistUrl = 'http://127.0.0.1:3201/w/real-machine-token/whitelist.txt';

  fs.writeFileSync(
    scenarioPath,
    JSON.stringify(
      {
        machine: {
          id: 'machine_123',
          machineHostname: 'classroom-abc-host',
          reportedHostname: 'windows-student-e2e',
          machineToken: 'bootstrap-token',
          whitelistUrl: 'http://127.0.0.1:3201/w/bootstrap-token/whitelist.txt',
        },
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  reconcileStudentScenario({
    scenarioPath,
    whitelistUrl,
  });

  const updatedScenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8')) as {
    machine: {
      machineToken: string;
      whitelistUrl: string;
    };
  };

  assert.equal(updatedScenario.machine.whitelistUrl, whitelistUrl);
  assert.equal(updatedScenario.machine.machineToken, 'real-machine-token');
});

await test('reconcileStudentScenario rejects whitelist URLs without a machine token segment', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpath-student-scenario-'));
  const scenarioPath = path.join(tempDir, 'student-scenario.json');

  fs.writeFileSync(
    scenarioPath,
    JSON.stringify(
      {
        machine: {
          machineToken: 'bootstrap-token',
          whitelistUrl: 'http://127.0.0.1:3201/w/bootstrap-token/whitelist.txt',
        },
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  assert.throws(
    () =>
      reconcileStudentScenario({
        scenarioPath,
        whitelistUrl: 'http://127.0.0.1:3201/whitelist.txt',
      }),
    /Could not extract machine token/
  );
});
