import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StudentPolicyDriver, type StudentScenario } from './student-policy-flow.e2e';

function createScenario(): StudentScenario {
  return {
    scenarioName: 'test',
    apiUrl: 'http://127.0.0.1:3201',
    auth: {
      admin: {
        email: 'admin@openpath.local',
        accessToken: 'admin-token',
        userId: 'admin-user',
      },
      teacher: {
        email: 'teacher@openpath.local',
        accessToken: 'teacher-token',
        userId: 'teacher-user',
      },
    },
    groups: {
      restricted: {
        id: 'restricted-group',
        name: 'restricted-group',
        displayName: 'Restricted Group',
      },
      alternate: {
        id: 'alternate-group',
        name: 'alternate-group',
        displayName: 'Alternate Group',
      },
    },
    classroom: {
      id: 'classroom-1',
      name: 'classroom-1',
      displayName: 'Classroom 1',
      defaultGroupId: 'restricted-group',
    },
    schedules: {
      activeRestriction: {
        id: 'schedule-1',
        classroomId: 'classroom-1',
        groupId: 'restricted-group',
        startAt: '2026-03-30T11:30:00.000Z',
        endAt: '2026-03-30T14:30:00.000Z',
      },
      futureAlternate: {
        id: 'schedule-2',
        classroomId: 'classroom-1',
        groupId: 'alternate-group',
        startAt: '2026-03-30T15:45:00.000Z',
        endAt: '2026-03-30T16:15:00.000Z',
      },
    },
    machine: {
      id: 'machine-1',
      classroomId: 'classroom-1',
      machineHostname: 'windows-student-e2e',
      reportedHostname: 'windows-student-e2e',
      machineToken: 'machine-token',
      whitelistUrl: 'http://127.0.0.1:3201/w/token/whitelist.txt',
    },
    fixtures: {
      portal: 'portal.127.0.0.1.sslip.io',
      cdnPortal: 'cdn.portal.127.0.0.1.sslip.io',
      site: 'site.127.0.0.1.sslip.io',
      apiSite: 'api.site.127.0.0.1.sslip.io',
    },
  };
}

test('assertWhitelistContains accepts Windows whitelist files with BOM and CRLF', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpath-whitelist-'));
  const whitelistPath = path.join(tempDir, 'whitelist.txt');
  const previousWhitelistPath = process.env.OPENPATH_WHITELIST_PATH;

  fs.writeFileSync(
    whitelistPath,
    '\uFEFF## WHITELIST\r\nportal.127.0.0.1.sslip.io\r\nsite.127.0.0.1.sslip.io\r\n',
    'utf8'
  );

  process.env.OPENPATH_WHITELIST_PATH = whitelistPath;

  try {
    const driver = new StudentPolicyDriver(createScenario(), {
      diagnosticsDir: tempDir,
      headless: true,
    });

    await assert.doesNotReject(() => driver.assertWhitelistContains('portal.127.0.0.1.sslip.io'));
  } finally {
    if (previousWhitelistPath === undefined) {
      delete process.env.OPENPATH_WHITELIST_PATH;
    } else {
      process.env.OPENPATH_WHITELIST_PATH = previousWhitelistPath;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
