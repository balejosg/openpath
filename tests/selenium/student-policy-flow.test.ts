import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildWindowsHttpProbeCommand,
  buildWindowsBlockedDnsCommand,
  StudentPolicyDriver,
  type StudentScenario,
} from './student-policy-flow.e2e';
import { openAndExpectBlocked } from './student-policy-driver-browser';

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

test('buildWindowsBlockedDnsCommand treats NXDOMAIN as a blocked result instead of a command failure', () => {
  const command = buildWindowsBlockedDnsCommand('cdn.base-only.127.0.0.1.sslip.io');

  assert.match(command, /Resolve-DnsName -Name 'cdn\.base-only\.127\.0\.0\.1\.sslip\.io'/);
  assert.match(command, /-ErrorAction Stop/);
  assert.match(command, /DNS name does not exist/);
  assert.match(command, /DNS_ERROR_RCODE_NAME_ERROR/);
  assert.match(command, /\bthrow\b/);
  assert.doesNotMatch(command, /catch \{ exit 0 \}/);
});

test('buildWindowsHttpProbeCommand uses a Windows-safe HTTP probe without POSIX redirection', () => {
  const command = buildWindowsHttpProbeCommand(
    'http://exempted-domain.127.0.0.1.sslip.io:18082/ok'
  );

  assert.match(command, /^powershell -NoLogo -EncodedCommand /);
  assert.doesNotMatch(command, />\/dev\/null/);
});

test('buildWindowsHttpProbeCommand avoids exposing raw URLs to cmd quoting and expansion', () => {
  const url = "http://exempted-domain.127.0.0.1.sslip.io:18082/o'k?token=%TEMP%";
  const command = buildWindowsHttpProbeCommand(url);

  assert.match(command, /^powershell -NoLogo -EncodedCommand /);
  assert.doesNotMatch(command, /%TEMP%/);
  assert.doesNotMatch(command, /o'k/);

  const encodedCommand = command.replace(/^powershell -NoLogo -EncodedCommand /, '');
  const decodedCommand = Buffer.from(encodedCommand, 'base64').toString('utf16le');

  assert.match(
    decodedCommand,
    /Invoke-WebRequest -Uri 'http:\/\/exempted-domain\.127\.0\.0\.1\.sslip\.io:18082\/o''k\?token=%TEMP%'/
  );
  assert.match(decodedCommand, /-UseBasicParsing/);
  assert.match(decodedCommand, /\| Out-Null/);
});

test('openAndExpectBlocked treats navigation timeout as blocked navigation', async () => {
  const timeoutError = new Error('Navigation timed out after 30000 ms');
  timeoutError.name = 'TimeoutError';

  const state = {
    getDriver() {
      return {
        async get() {
          throw timeoutError;
        },
      };
    },
  };

  await assert.doesNotReject(() =>
    openAndExpectBlocked(state as never, {
      url: 'http://blocked.example.test/',
    })
  );
});
