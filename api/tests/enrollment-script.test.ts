import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildLinuxEnrollmentScript } from '../src/lib/enrollment-script.js';

void describe('Linux enrollment bootstrap script generation', () => {
  void test('pins the requested linux agent version when one is available', () => {
    const script = buildLinuxEnrollmentScript({
      publicUrl: 'https://control.example',
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
      publicUrl: 'https://control.example',
      classroomId: 'cls_123',
      classroomName: 'Aula 1',
      enrollmentToken: 'token-123',
      aptRepoUrl: 'https://repo.example/apt',
      linuxAgentVersion: '',
    });

    assert.doesNotMatch(script, /LINUX_AGENT_VERSION=/);
    assert.doesNotMatch(script, /--package-version "\$LINUX_AGENT_VERSION"/);
    assert.match(script, /bootstrap_cmd\+=\(--api-url "\$API_URL" --classroom "\$CLASSROOM_NAME"/);
  });

  void test('uses the unstable APT track when requested by release metadata', () => {
    const script = buildLinuxEnrollmentScript({
      publicUrl: 'https://control.example',
      classroomId: 'cls_123',
      classroomName: 'Aula 1',
      enrollmentToken: 'token-123',
      aptRepoUrl: 'https://repo.example/apt',
      linuxAgentVersion: '0.0.1380',
      linuxAgentAptSuite: 'unstable',
    });

    assert.match(script, /LINUX_AGENT_APT_SUITE='unstable'/);
    assert.match(script, /bootstrap_cmd\+=\(--unstable\)/);
    assert.match(script, /bootstrap_cmd\+=\(--package-version "\$LINUX_AGENT_VERSION"\)/);
  });

  void test('requires the final health check to pass before reporting success', () => {
    const script = buildLinuxEnrollmentScript({
      publicUrl: 'https://control.example',
      classroomId: 'cls_123',
      classroomName: 'Aula 1',
      enrollmentToken: 'token-123',
      aptRepoUrl: 'https://repo.example/apt',
      linuxAgentVersion: '',
    });

    assert.match(script, /\nopenpath health\n/);
    assert.doesNotMatch(script, /openpath health \|\| true/);
  });
});
