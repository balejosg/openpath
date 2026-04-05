import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildLinuxEnrollmentScript } from '../src/lib/enrollment-script.js';

void describe('Linux enrollment bootstrap script generation', () => {
  void test('pins the requested linux agent version when one is available', () => {
    const script = buildLinuxEnrollmentScript({
      publicUrl: 'https://classroompath.eu',
      classroomId: 'cls_123',
      classroomName: 'Aula 1',
      enrollmentToken: 'token-123',
      aptRepoUrl: 'https://repo.example/apt',
      linuxAgentVersion: '4.1.10',
    });

    assert.match(script, /LINUX_AGENT_VERSION='4\.1\.10'/);
    assert.match(script, /--package-version "\$LINUX_AGENT_VERSION"/);
  });

  void test('omits package pinning when no published linux agent version should be forced', () => {
    const script = buildLinuxEnrollmentScript({
      publicUrl: 'https://classroompath.eu',
      classroomId: 'cls_123',
      classroomName: 'Aula 1',
      enrollmentToken: 'token-123',
      aptRepoUrl: 'https://repo.example/apt',
      linuxAgentVersion: '',
    });

    assert.doesNotMatch(script, /LINUX_AGENT_VERSION=/);
    assert.doesNotMatch(script, /--package-version "\$LINUX_AGENT_VERSION"/);
    assert.match(
      script,
      /bootstrap_cmd=\(bash "\$tmpfile" --api-url "\$API_URL" --classroom "\$CLASSROOM_NAME"/
    );
  });
});
