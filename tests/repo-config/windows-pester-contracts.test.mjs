import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readText } from './support.mjs';

function extractPesterContext(testText, contextName) {
  const escapedContextName = contextName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const contextPattern = new RegExp(
    `Context "${escapedContextName}" \\{[\\s\\S]*?(?=\\n    Context "|\\n\\})`
  );
  const match = testText.match(contextPattern);

  assert.ok(match, `Windows.Common.Mocked.Tests.ps1 should define ${contextName}`);
  return match[0];
}

test('checkpoint restore Pester test keeps DNS and firewall helpers module-scoped', () => {
  const commonMockedTests = readText('windows/tests/Windows.Common.Mocked.Tests.ps1');
  const checkpointContext = extractPesterContext(
    commonMockedTests,
    'Restore-OpenPathLatestCheckpoint'
  );

  for (const helperName of [
    'Update-AcrylicHost',
    'Restart-AcrylicService',
    'Get-AcrylicPath',
    'Set-OpenPathFirewall',
    'Set-LocalDNS',
    'Enable-OpenPathFirewall',
  ]) {
    assert.match(
      checkpointContext,
      new RegExp(`Mock ${helperName} \\{[\\s\\S]*?\\} -ModuleName Common`),
      `${helperName} must be mocked inside the Common module so hosted Pester does not mutate DNS/firewall state`
    );
  }

  for (const helperName of [
    'Update-AcrylicHost',
    'Restart-AcrylicService',
    'Get-AcrylicPath',
    'Set-OpenPathFirewall',
    'Set-LocalDNS',
  ]) {
    assert.match(
      checkpointContext,
      new RegExp(`Should -Invoke ${helperName} -ModuleName Common -Times 1 -Exactly`),
      `${helperName} should be asserted through the Common module mock`
    );
  }

  assert.match(
    checkpointContext,
    /Should -Invoke Enable-OpenPathFirewall -ModuleName Common -Times 0 -Exactly/,
    'Enable-OpenPathFirewall fallback should stay mocked and unused in the checkpoint restore test'
  );
});
