import assert from 'node:assert';
import { buildFixtureUrl, buildScenarioHost, delay, readWhitelistFile } from './student-policy-env';
import { StudentPolicyServerClient } from './student-policy-client';
import { StudentPolicyDriver } from './student-policy-driver';
import type { PolicyMode, StudentScenario } from './student-policy-types';

interface StudentPolicyTargets {
  portalOkUrl: string;
  portalCdnAssetUrl: string;
  siteOkUrl: string;
  sitePrivateUrl: string;
  siteXhrPrivateUrl: string;
  requestDomainUrl: string;
  rejectedDomainUrl: string;
  duplicateDomainUrl: string;
  exemptedDomainUrl: string;
  baseOnlyUrl: string;
  baseOnlyCdnAssetUrl: string;
  alternateOnlyUrl: string;
  autoDomainFetchUrl: string;
  hosts: {
    request: string;
    rejected: string;
    duplicate: string;
    exempted: string;
    baseOnly: string;
    alternateOnly: string;
    auto: string;
  };
}

function buildTargets(scenario: StudentScenario): StudentPolicyTargets {
  const requestHost = buildScenarioHost(scenario, 'request-domain');
  const rejectedHost = buildScenarioHost(scenario, 'rejected-domain');
  const duplicateHost = buildScenarioHost(scenario, 'duplicate-domain');
  const exemptedHost = buildScenarioHost(scenario, 'exempted-domain');
  const baseOnlyHost = buildScenarioHost(scenario, 'base-only');
  const alternateOnlyHost = buildScenarioHost(scenario, 'alternate-only');
  const autoHost = buildScenarioHost(scenario, 'auto-domain');

  return {
    portalOkUrl: buildFixtureUrl(scenario.fixtures.portal, '/ok'),
    portalCdnAssetUrl: buildFixtureUrl(scenario.fixtures.cdnPortal, '/asset.js'),
    siteOkUrl: buildFixtureUrl(scenario.fixtures.site, '/ok'),
    sitePrivateUrl: buildFixtureUrl(scenario.fixtures.site, '/private'),
    siteXhrPrivateUrl: buildFixtureUrl(scenario.fixtures.site, '/xhr/private.json'),
    requestDomainUrl: buildFixtureUrl(requestHost, '/ok'),
    rejectedDomainUrl: buildFixtureUrl(rejectedHost, '/ok'),
    duplicateDomainUrl: buildFixtureUrl(duplicateHost, '/ok'),
    exemptedDomainUrl: buildFixtureUrl(exemptedHost, '/ok'),
    baseOnlyUrl: buildFixtureUrl(baseOnlyHost, '/ok'),
    baseOnlyCdnAssetUrl: buildFixtureUrl(`cdn.${baseOnlyHost}`, '/asset.js'),
    alternateOnlyUrl: buildFixtureUrl(alternateOnlyHost, '/ok'),
    autoDomainFetchUrl: buildFixtureUrl(autoHost, '/fetch/private.json'),
    hosts: {
      request: requestHost,
      rejected: rejectedHost,
      duplicate: duplicateHost,
      exempted: exemptedHost,
      baseOnly: baseOnlyHost,
      alternateOnly: alternateOnlyHost,
      auto: autoHost,
    },
  };
}

function isWhitelistableHost(hostname: string): boolean {
  const labels = hostname.split('.');
  const tld = labels.at(-1) ?? '';
  return labels.length >= 2 && /^[a-z]{2,63}$/i.test(tld);
}

export function buildBaselineWhitelistHosts(
  scenario: StudentScenario,
  targets: StudentPolicyTargets
): {
  restricted: string[];
  alternate: string[];
} {
  const hosts = [
    scenario.fixtures.portal,
    scenario.fixtures.cdnPortal,
    scenario.fixtures.site,
    scenario.fixtures.apiSite,
  ];

  const apiHostname = new URL(scenario.apiUrl).hostname;
  if (isWhitelistableHost(apiHostname)) {
    hosts.push(apiHostname);
  }

  return {
    restricted: [...new Set([...hosts, targets.hosts.baseOnly])],
    alternate: [...new Set([...hosts, targets.hosts.alternateOnly])],
  };
}

async function settlePolicyChange(
  driver: StudentPolicyDriver,
  mode: PolicyMode,
  assertion: () => Promise<void>,
  options: { refreshBlockedPaths?: boolean; timeoutMs?: number } = {}
): Promise<void> {
  const runAssertion = async (): Promise<void> => {
    await driver.waitForConvergence(assertion, { timeoutMs: options.timeoutMs });
  };

  const forceConvergence = async (): Promise<void> => {
    await driver.forceLocalUpdate();
    await delay(2_000);
    if (options.refreshBlockedPaths === true) {
      await driver.refreshBlockedPathRules();
    }
  };

  if (mode === 'fallback') {
    await driver.waitForConvergence(
      async () => {
        await forceConvergence();
        await assertion();
      },
      { timeoutMs: options.timeoutMs ?? 45_000, pollMs: 1_000 }
    );
    return;
  }

  try {
    await runAssertion();
  } catch {
    await forceConvergence();
    await runAssertion();
  }
}

function logScenarioStep(message: string): void {
  process.stdout.write(`student-policy: ${message}\n`);
}

async function seedBaselineWhitelist(
  client: StudentPolicyServerClient,
  driver: StudentPolicyDriver,
  mode: PolicyMode,
  targets: StudentPolicyTargets,
  options: { verifyBrowser?: boolean } = {}
): Promise<void> {
  const restrictedGroupId = driver.scenario.groups.restricted.id;
  const alternateGroupId = driver.scenario.groups.alternate.id;
  const baselineHosts = buildBaselineWhitelistHosts(driver.scenario, targets);

  for (const host of baselineHosts.restricted) {
    await client.ensureWhitelistRule(restrictedGroupId, host, 'Student policy restricted baseline');
  }

  for (const host of baselineHosts.alternate) {
    await client.ensureWhitelistRule(alternateGroupId, host, 'Student policy alternate baseline');
  }

  await driver.forceLocalUpdate();

  await settlePolicyChange(driver, mode, async () => {
    await driver.assertWhitelistContains(driver.scenario.fixtures.portal);
    await driver.assertWhitelistContains(driver.scenario.fixtures.site);
    if (options.verifyBrowser !== false) {
      await driver.openAndExpectLoaded({
        url: targets.portalOkUrl,
        title: 'OpenPath Portal Fixture',
        selector: '#page-status',
      });
      await driver.waitForDomStatus('#subdomain-status', 'ok');
      await driver.openAndExpectLoaded({
        url: targets.siteOkUrl,
        title: 'OpenPath Site Fixture',
        selector: '#page-status',
      });
    }
  });
}

async function runRequestLifecycleScenarios(
  client: StudentPolicyServerClient,
  driver: StudentPolicyDriver,
  mode: PolicyMode,
  targets: StudentPolicyTargets
): Promise<void> {
  logScenarioStep('SP-001 to SP-005 request lifecycle');

  await driver.assertDnsBlocked(targets.hosts.request);
  const requestStatusText = await driver.openBlockedScreenAndSubmitRequest(
    targets.requestDomainUrl,
    {
      reason: 'Request host needed for lesson flow',
      timeoutMs: 30_000,
    }
  );
  assert.match(requestStatusText, /Solicitud enviada/);

  const pending = await client.findPendingRequestByDomain(targets.hosts.request);
  const pendingStatus = await client.getRequestStatus(pending.id);
  assert.strictEqual(pendingStatus.status, 'pending');
  await driver.openAndExpectBlocked({
    url: targets.requestDomainUrl,
    forbiddenText: 'Site Fixture',
  });

  await client.approveRequest(pending.id, driver.scenario.groups.restricted.id);
  await settlePolicyChange(driver, mode, async () => {
    await driver.assertDnsAllowed(targets.hosts.request);
    await driver.assertWhitelistContains(targets.hosts.request);
    await driver.openAndExpectLoaded({
      url: targets.requestDomainUrl,
      title: 'OpenPath Site Fixture',
      selector: '#page-status',
    });
  });

  const rejected = await client.submitManualRequest(
    targets.hosts.rejected,
    'This request should be rejected for policy verification'
  );
  assert.strictEqual(rejected.success, true);
  assert.ok(rejected.id !== undefined);
  await client.rejectRequest(rejected.id ?? '', 'Rejected during Selenium policy test');
  const rejectedStatus = await client.getRequestStatus(rejected.id ?? '');
  assert.strictEqual(rejectedStatus.status, 'rejected');
  await driver.assertDnsBlocked(targets.hosts.rejected);
  await driver.openAndExpectBlocked({
    url: targets.rejectedDomainUrl,
    forbiddenText: 'Site Fixture',
  });

  const duplicateInitial = await client.submitManualRequest(
    targets.hosts.duplicate,
    'Duplicate request first submission'
  );
  assert.strictEqual(duplicateInitial.success, true);
  assert.ok(duplicateInitial.id !== undefined);

  const duplicateFollowUp = await client.submitManualRequest(
    targets.hosts.duplicate,
    'Duplicate request second submission'
  );
  assert.strictEqual(duplicateFollowUp.success, false);
  assert.ok((duplicateFollowUp.error ?? '').length > 0);
  await driver.assertDnsBlocked(targets.hosts.duplicate);
}

async function runBlockedSubdomainScenarios(
  client: StudentPolicyServerClient,
  driver: StudentPolicyDriver,
  mode: PolicyMode,
  targets: StudentPolicyTargets
): Promise<void> {
  logScenarioStep('SP-008 to SP-010 blocked subdomain');

  const blockedSubdomainHost = `cdn.${targets.hosts.baseOnly}`;

  const rule = await client.createGroupRule(
    driver.scenario.groups.restricted.id,
    'blocked_subdomain',
    blockedSubdomainHost,
    'Block CDN subdomain for Selenium policy test'
  );

  await settlePolicyChange(driver, mode, async () => {
    await driver.assertDnsAllowed(targets.hosts.baseOnly);
    await driver.assertDnsBlocked(blockedSubdomainHost);
    await driver.openAndExpectLoaded({
      url: targets.baseOnlyUrl,
      title: 'OpenPath Site Fixture',
      selector: '#page-status',
    });
    await driver.rerunPortalSubdomainProbe();
    await driver.waitForDomStatus('#subdomain-status', 'blocked');
    await driver.openAndExpectBlocked({
      url: targets.baseOnlyCdnAssetUrl,
      forbiddenText: '__openpathPortalAssetLoaded',
    });
  });

  await client.deleteGroupRule(rule.id, driver.scenario.groups.restricted.id);
  await settlePolicyChange(driver, mode, async () => {
    await driver.assertDnsAllowed(blockedSubdomainHost);
    await driver.openAndExpectLoaded({
      url: targets.baseOnlyUrl,
      title: 'OpenPath Site Fixture',
      selector: '#page-status',
    });
    await driver.rerunPortalSubdomainProbe();
    await driver.waitForDomStatus('#subdomain-status', 'ok');
  });
}

async function runBlockedPathScenarios(
  client: StudentPolicyServerClient,
  driver: StudentPolicyDriver,
  mode: PolicyMode,
  targets: StudentPolicyTargets
): Promise<void> {
  logScenarioStep('SP-011 to SP-015 blocked path');

  const rule = await client.createGroupRule(
    driver.scenario.groups.restricted.id,
    'blocked_path',
    `${driver.scenario.fixtures.site}/*private*`,
    'Block private route for Selenium policy test'
  );

  await driver.forceLocalUpdate();
  await driver.restart();

  try {
    await driver.refreshBlockedPathRules();
  } catch (error) {
    logScenarioStep(
      `blocked-path refresh error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const blockedPathDebug = await driver.getBlockedPathRulesDebug();
  const nativeBlockedPathDebug = await driver.getNativeBlockedPathsDebug();
  logScenarioStep(
    `blocked-path debug: count=${blockedPathDebug.count.toString()} rules=${blockedPathDebug.rawRules.join(',')}`
  );
  logScenarioStep(
    `native blocked-path debug: success=${String(nativeBlockedPathDebug.success)} count=${nativeBlockedPathDebug.count.toString()} rules=${nativeBlockedPathDebug.paths.join(',')} source=${nativeBlockedPathDebug.source ?? '-'} error=${nativeBlockedPathDebug.error ?? '-'}`
  );
  logScenarioStep(
    `blocked-path evaluate xhr debug: ${JSON.stringify(
      await driver.evaluateBlockedPathDebug(targets.siteXhrPrivateUrl, 'xmlhttprequest')
    )}`
  );

  await settlePolicyChange(driver, mode, async () => {
    logScenarioStep('SP-011 verify main-frame path block');
    await driver.openAndExpectLoaded({
      url: targets.siteOkUrl,
      title: 'OpenPath Site Fixture',
      selector: '#page-status',
    });
    await driver.openAndExpectBlockedScreen(targets.sitePrivateUrl, {
      reasonPrefix: 'BLOCKED_PATH_POLICY:',
    });
    logScenarioStep('SP-012 verify iframe path block');
    await driver.openAndExpectLoaded({
      url: targets.siteOkUrl,
      title: 'OpenPath Site Fixture',
      selector: '#page-status',
    });
    await driver.rerunIframeProbe();
    await driver.waitForDomStatus('#iframe-status', 'blocked');
    logScenarioStep('SP-013 verify XHR path block');
    await driver.rerunXhrProbe();
    await driver.waitForDomStatus('#xhr-status', 'blocked');
    logScenarioStep('SP-014 verify fetch path block');
    await driver.rerunFetchProbe();
    await driver.waitForDomStatus('#fetch-status', 'blocked');
  });

  await client.deleteGroupRule(rule.id, driver.scenario.groups.restricted.id);
  await driver.forceLocalUpdate();
  await driver.restart();
  await settlePolicyChange(driver, mode, async () => {
    logScenarioStep('SP-015 verify path unblock');
    await driver.openAndExpectLoaded({
      url: targets.sitePrivateUrl,
      title: 'Private Fixture',
      selector: '#page-status',
    });
    await driver.openAndExpectLoaded({
      url: targets.siteOkUrl,
      title: 'OpenPath Site Fixture',
      selector: '#page-status',
    });
    await driver.rerunIframeProbe();
    await driver.waitForDomStatus('#iframe-status', 'ok');
    await driver.rerunXhrProbe();
    await driver.waitForDomStatus('#xhr-status', 'ok');
    await driver.rerunFetchProbe();
    await driver.waitForDomStatus('#fetch-status', 'ok');
  });
}

async function runTemporaryExemptionScenarios(
  client: StudentPolicyServerClient,
  driver: StudentPolicyDriver,
  mode: PolicyMode,
  targets: StudentPolicyTargets
): Promise<void> {
  logScenarioStep('SP-016 to SP-018 temporary exemptions');

  await driver.assertDnsBlocked(targets.hosts.exempted);

  const exemption = await client.createTemporaryExemption(
    driver.scenario.schedules.activeRestriction.id
  );
  await settlePolicyChange(driver, mode, async () => {
    await driver.assertHttpReachable(targets.exemptedDomainUrl);
    await driver.assertWhitelistMissing(targets.hosts.exempted);
  });

  await client.deleteTemporaryExemption(exemption.id);
  await settlePolicyChange(driver, mode, async () => {
    await driver.assertDnsBlocked(targets.hosts.exempted);
    await driver.assertHttpBlocked(targets.exemptedDomainUrl);
  });

  const expiringExemption = await client.createTemporaryExemption(
    driver.scenario.schedules.activeRestriction.id
  );
  await settlePolicyChange(driver, mode, async () => {
    await driver.assertHttpReachable(targets.exemptedDomainUrl);
  });

  await client.setTestClock(driver.scenario.schedules.activeRestriction.endAt);
  await client.tickBoundaries(driver.scenario.schedules.activeRestriction.endAt);
  await settlePolicyChange(driver, mode, async () => {
    await driver.assertDnsBlocked(targets.hosts.exempted);
    await driver.assertHttpBlocked(targets.exemptedDomainUrl);
  });
  await client.setTestClock(null);

  void expiringExemption;
}

async function runActiveGroupAndScheduleScenarios(
  client: StudentPolicyServerClient,
  driver: StudentPolicyDriver,
  mode: PolicyMode,
  targets: StudentPolicyTargets
): Promise<void> {
  logScenarioStep('SP-019 to SP-022 active group and schedule');

  await settlePolicyChange(driver, mode, async () => {
    await driver.assertWhitelistContains(targets.hosts.baseOnly);
    await driver.assertWhitelistMissing(targets.hosts.alternateOnly);
  });

  const currentGroup = await client.setActiveGroup(driver.scenario.groups.alternate.id);
  assert.strictEqual(currentGroup, driver.scenario.groups.alternate.id);
  logScenarioStep(
    `machine context after setActiveGroup: ${JSON.stringify(await client.getMachineContext())}`
  );
  logScenarioStep(`whitelist after setActiveGroup:\n${await client.fetchMachineWhitelist()}`);
  await settlePolicyChange(driver, mode, async () => {
    logScenarioStep(`local whitelist snapshot after setActiveGroup:\n${await readWhitelistFile()}`);
    await driver.assertWhitelistContains(targets.hosts.alternateOnly);
    await driver.assertWhitelistMissing(targets.hosts.baseOnly);
  });

  const restoredGroup = await client.setActiveGroup(null);
  assert.strictEqual(restoredGroup, driver.scenario.groups.restricted.id);
  await settlePolicyChange(driver, mode, async () => {
    await driver.assertWhitelistContains(targets.hosts.baseOnly);
    await driver.assertWhitelistMissing(targets.hosts.alternateOnly);
  });

  await client.tickBoundaries(driver.scenario.schedules.futureAlternate.startAt);
  await client.setTestClock(driver.scenario.schedules.futureAlternate.startAt);
  await settlePolicyChange(driver, mode, async () => {
    await driver.assertWhitelistContains(targets.hosts.alternateOnly);
  });

  await client.setTestClock(driver.scenario.schedules.futureAlternate.endAt);
  await client.tickBoundaries(driver.scenario.schedules.futureAlternate.endAt);
  await settlePolicyChange(driver, mode, async () => {
    await driver.assertWhitelistMissing(targets.hosts.alternateOnly);
  });
  await client.setTestClock(null);
}

async function runAutoApproveProbe(
  client: StudentPolicyServerClient,
  driver: StudentPolicyDriver,
  mode: PolicyMode,
  targets: StudentPolicyTargets
): Promise<void> {
  logScenarioStep('SP-006 and SP-007 auto-approve');

  await client.setAutoApprove(false);
  const pendingAutoRequest = await client.submitAutoRequest(
    targets.hosts.auto,
    'Auto-approve disabled should keep request pending'
  );
  assert.strictEqual(pendingAutoRequest.success, true);
  assert.strictEqual(pendingAutoRequest.autoApproved, false);
  await settlePolicyChange(driver, mode, async () => {
    await driver.assertDnsBlocked(targets.hosts.auto);
  });

  await client.setAutoApprove(true);
  const autoRequest = await client.submitAutoRequest(
    targets.hosts.auto,
    'Auto-approve test trigger'
  );
  assert.strictEqual(autoRequest.success, true);
  await settlePolicyChange(driver, mode, async () => {
    await driver.assertWhitelistContains(targets.hosts.auto);
  });
}

export async function runStudentPolicyMatrix(
  client: StudentPolicyServerClient,
  driver: StudentPolicyDriver,
  mode: PolicyMode
): Promise<void> {
  const targets = buildTargets(driver.scenario);

  await seedBaselineWhitelist(client, driver, mode, targets);
  await runRequestLifecycleScenarios(client, driver, mode, targets);
  await runBlockedSubdomainScenarios(client, driver, mode, targets);
  await runBlockedPathScenarios(client, driver, mode, targets);
}

export async function runStudentPolicyMatrixPhaseTwo(
  client: StudentPolicyServerClient,
  driver: StudentPolicyDriver,
  mode: PolicyMode
): Promise<void> {
  const targets = buildTargets(driver.scenario);

  await seedBaselineWhitelist(client, driver, mode, targets, { verifyBrowser: false });
  await runTemporaryExemptionScenarios(client, driver, mode, targets);
  await runActiveGroupAndScheduleScenarios(client, driver, mode, targets);
  await runAutoApproveProbe(client, driver, mode, targets);
}
