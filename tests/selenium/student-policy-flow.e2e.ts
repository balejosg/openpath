import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert';

import { Builder, By, until, type WebDriver, type WebElement } from 'selenium-webdriver';
import * as firefox from 'selenium-webdriver/firefox';

import { waitForFirefoxExtensionUuid } from './firefox-extension-uuid';

const exec = promisify(execCallback);

const FIREFOX_EXTENSION_ID = 'monitor-bloqueos@openpath';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_BLOCKED_TIMEOUT_MS = 8_000;
const DEFAULT_POLL_MS = 250;
const DEFAULT_DIAGNOSTICS_DIR = path.resolve(__dirname, '../../artifacts/student-policy');
const DEFAULT_EXTENSION_PATH = path.resolve(
  __dirname,
  '../../firefox-extension/openpath-firefox-extension.xpi'
);

export interface HarnessSession {
  email: string;
  accessToken: string;
  userId?: string;
}

export interface HarnessGroup {
  id: string;
  name: string;
  displayName: string;
}

export interface HarnessClassroom {
  id: string;
  name: string;
  displayName: string;
  defaultGroupId: string;
}

export interface HarnessSchedule {
  id: string;
  classroomId: string;
  groupId: string;
  startAt: string;
  endAt: string;
}

export interface HarnessMachine {
  id: string;
  classroomId: string;
  machineHostname: string;
  reportedHostname: string;
  machineToken: string;
  whitelistUrl: string;
}

export interface StudentFixtureHosts {
  portal: string;
  cdnPortal: string;
  site: string;
  apiSite: string;
}

export interface StudentScenario {
  scenarioName: string;
  apiUrl: string;
  auth: {
    admin: HarnessSession;
    teacher: HarnessSession;
  };
  groups: {
    restricted: HarnessGroup;
    alternate: HarnessGroup;
  };
  classroom: HarnessClassroom;
  schedules: {
    activeRestriction: HarnessSchedule;
    futureAlternate: HarnessSchedule;
  };
  machine: HarnessMachine;
  fixtures: StudentFixtureHosts;
}

export interface OpenAndExpectLoadedOptions {
  url: string;
  title?: string;
  selector?: string;
  timeoutMs?: number;
}

export interface OpenAndExpectBlockedOptions {
  url: string;
  forbiddenSelector?: string;
  forbiddenText?: string;
  timeoutMs?: number;
}

export interface BlockedScreenExpectation {
  reasonPrefix?: string;
  timeoutMs?: number;
}

export interface ConvergenceOptions {
  timeoutMs?: number;
  pollMs?: number;
}

export interface StudentPolicyDriverOptions {
  diagnosticsDir?: string;
  extensionPath?: string;
  firefoxBinaryPath?: string;
  headless?: boolean;
}

export interface RunResult {
  success: boolean;
  diagnosticsDir: string;
}

type PolicyMode = 'sse' | 'fallback';

interface RequestSubmissionResult {
  success: boolean;
  id?: string;
  status?: string;
  approved?: boolean;
  autoApproved?: boolean;
  duplicate?: boolean;
  error?: string;
}

interface RequestStatusResult {
  id: string;
  domain: string;
  status: string;
}

interface RuleResult {
  id: string;
  groupId?: string;
  type?: string;
  value?: string;
}

interface ExemptionResult {
  id: string;
  machineId: string;
  classroomId: string;
  scheduleId: string;
  expiresAt: string;
}

interface DomainStatusPayload {
  hostname: string;
  state: 'detected' | 'pending' | 'autoApproved' | 'duplicate' | 'localUpdateError' | 'apiError';
  updatedAt: number;
  message?: string;
}

interface RuntimeResponse<T> {
  success?: boolean;
  error?: string;
  statuses?: Record<string, DomainStatusPayload>;
  domains?: Record<string, unknown>;
  available?: boolean;
  value?: T;
  version?: string;
  count?: number;
  rawRules?: string[];
  compiledPatterns?: string[];
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function normalizeBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function shouldSkipBundledExtension(): boolean {
  return normalizeBoolean(optionalEnv('OPENPATH_SKIP_EXTENSION_BUNDLE'), false);
}

function getDiagnosticsDir(rootDir = DEFAULT_DIAGNOSTICS_DIR): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(rootDir, timestamp);
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function loadScenarioFromEnv(): Promise<StudentScenario> {
  const inline = optionalEnv('OPENPATH_STUDENT_SCENARIO_JSON');
  if (inline !== undefined) {
    return JSON.parse(inline) as StudentScenario;
  }

  const filePath = optionalEnv('OPENPATH_STUDENT_SCENARIO_FILE');
  if (filePath !== undefined) {
    const fileContents = await fs.readFile(filePath, 'utf8');
    return JSON.parse(fileContents) as StudentScenario;
  }

  throw new Error(
    'Set OPENPATH_STUDENT_SCENARIO_JSON or OPENPATH_STUDENT_SCENARIO_FILE before running the Selenium suite'
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function discoverFirefoxExtensionUuid(profileDir: string): Promise<string> {
  return waitForFirefoxExtensionUuid({
    profileDir,
    extensionId: FIREFOX_EXTENSION_ID,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
}

function buildPopupUrl(extensionUuid: string): string {
  return `moz-extension://${extensionUuid}/popup/popup.html`;
}

async function runPlatformCommand(command: string): Promise<string> {
  const { stdout, stderr } = await exec(command);
  return `${stdout}${stderr}`.trim();
}

function isWindows(): boolean {
  return os.platform() === 'win32';
}

function getWhitelistPath(): string {
  return (
    optionalEnv('OPENPATH_WHITELIST_PATH') ??
    (isWindows() ? 'C:\\OpenPath\\data\\whitelist.txt' : '/var/lib/openpath/whitelist.txt')
  );
}

function getUpdateCommand(): string {
  return (
    optionalEnv('OPENPATH_FORCE_UPDATE_COMMAND') ??
    (isWindows()
      ? 'powershell -NoLogo -File "C:\\OpenPath\\scripts\\Update-OpenPath.ps1"'
      : 'sudo /usr/local/bin/openpath-update.sh --update')
  );
}

function getDisableSseCommand(): string {
  return (
    optionalEnv('OPENPATH_DISABLE_SSE_COMMAND') ??
    (isWindows()
      ? 'powershell -NoLogo -Command "Stop-ScheduledTask -TaskName \"OpenPath-SSE\" -ErrorAction SilentlyContinue"'
      : 'sudo systemctl stop openpath-sse-listener.service')
  );
}

function getEnableSseCommand(): string {
  return (
    optionalEnv('OPENPATH_ENABLE_SSE_COMMAND') ??
    (isWindows()
      ? 'powershell -NoLogo -Command "Start-ScheduledTask -TaskName \"OpenPath-SSE\" -ErrorAction SilentlyContinue"'
      : 'sudo systemctl start openpath-sse-listener.service')
  );
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function readWhitelistFile(): Promise<string> {
  return fs.readFile(getWhitelistPath(), 'utf8');
}

function getFixturePort(): string {
  return optionalEnv('OPENPATH_FIXTURE_PORT') ?? '80';
}

function getStudentHostSuffix(): string {
  return (optionalEnv('OPENPATH_STUDENT_HOST_SUFFIX') ?? '127.0.0.1.sslip.io')
    .trim()
    .replace(/^\.+|\.+$/g, '');
}

function getFixtureIpForHostname(hostname: string): string | null {
  const suffix = getStudentHostSuffix();
  if (!hostname.endsWith(`.${suffix}`) && hostname !== suffix) {
    return null;
  }

  const match = /((?:\d{1,3}\.){3}\d{1,3})/.exec(suffix);
  return match?.[1] ?? null;
}

function buildFixtureUrl(hostname: string, pathname: string): string {
  return `http://${hostname}:${getFixturePort()}${pathname}`;
}

function buildHost(label: string): string {
  return `${label}.${getStudentHostSuffix()}`;
}

function buildScenarioHost(scenario: StudentScenario, label: string): string {
  const suffix = getStudentHostSuffix();
  const token =
    scenario.classroom.id
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .slice(-8) || 'scenario';
  return `${label}-${token}.${suffix}`;
}

function getPolicyMode(): PolicyMode {
  const mode = optionalEnv('OPENPATH_STUDENT_MODE');
  return mode === 'fallback' ? 'fallback' : 'sse';
}

function isRuleAlreadyPresent(errorMessage: string): boolean {
  return /already exists|duplicate/i.test(errorMessage);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function parseJsonBody<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function parseTrpcResponse<T>(response: Response, procedure: string): Promise<T> {
  const payload = (await response.json()) as {
    result?: { data?: T };
    error?: { message?: string; data?: { code?: string } };
  };

  if (response.ok && payload.result?.data !== undefined) {
    return payload.result.data;
  }

  throw new Error(
    `tRPC call ${procedure} failed: ${payload.error?.message ?? `HTTP ${String(response.status)}`}`
  );
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class StudentPolicyDriver {
  public readonly scenario: StudentScenario;

  public readonly diagnosticsDir: string;

  private readonly extensionPath: string;

  private readonly firefoxBinaryPath?: string;

  private readonly headless: boolean;

  private driver: WebDriver | null = null;

  private extensionUuid: string | null = null;

  public constructor(scenario: StudentScenario, options: StudentPolicyDriverOptions = {}) {
    this.scenario = scenario;
    this.diagnosticsDir =
      options.diagnosticsDir ??
      optionalEnv('OPENPATH_STUDENT_DIAGNOSTICS_DIR') ??
      getDiagnosticsDir();
    this.extensionPath =
      options.extensionPath ?? optionalEnv('OPENPATH_EXTENSION_PATH') ?? DEFAULT_EXTENSION_PATH;
    this.firefoxBinaryPath = options.firefoxBinaryPath ?? optionalEnv('OPENPATH_FIREFOX_BINARY');
    this.headless = options.headless ?? normalizeBoolean(optionalEnv('CI'), true);
  }

  public async setup(): Promise<void> {
    await ensureDirectory(this.diagnosticsDir);

    const options = new firefox.Options();
    if (!shouldSkipBundledExtension()) {
      options.addExtensions(this.extensionPath);
    }
    if (this.firefoxBinaryPath !== undefined) {
      options.setBinary(this.firefoxBinaryPath);
    }
    options.setPreference('network.dns.disablePrefetch', true);
    options.setPreference('dom.webnotifications.enabled', true);
    options.setPreference('extensions.experiments.enabled', true);

    if (this.headless) {
      options.addArguments('-headless');
    }

    this.driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).build();
    await this.driver.manage().setTimeouts({ implicit: 2_000, pageLoad: 30_000, script: 15_000 });

    const capabilities = await this.driver.getCapabilities();
    const profileDir = capabilities.get('moz:profile') as string | undefined;
    if (profileDir !== undefined && profileDir !== '') {
      this.extensionUuid = await discoverFirefoxExtensionUuid(profileDir);
    }
  }

  public async teardown(): Promise<void> {
    if (this.driver !== null) {
      try {
        await this.driver.quit();
      } catch {
        // Best-effort cleanup. The browser process may already be gone.
      }
      this.driver = null;
    }
  }

  public async restart(): Promise<void> {
    await this.teardown();
    await this.setup();
  }

  public async ensureReady(): Promise<void> {
    if (this.driver === null) {
      await this.setup();
      return;
    }

    try {
      await this.driver.getTitle();
    } catch {
      this.driver = null;
      this.extensionUuid = null;
      await this.setup();
    }
  }

  public getDriver(): WebDriver {
    if (this.driver === null) {
      throw new Error('Firefox WebDriver is not initialized. Call setup() first.');
    }
    return this.driver;
  }

  public getExtensionUuid(): string {
    if (this.extensionUuid === null) {
      throw new Error('Extension UUID is not available; setup() must complete successfully first.');
    }
    return this.extensionUuid;
  }

  public async openAndExpectLoaded(options: OpenAndExpectLoadedOptions): Promise<void> {
    await this.withSessionRetry(async () => {
      const driver = this.getDriver();
      await driver.get(options.url);

      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      if (options.title !== undefined) {
        await driver.wait(until.titleContains(options.title), timeoutMs);
      }

      if (options.selector !== undefined) {
        await driver.wait(until.elementLocated(By.css(options.selector)), timeoutMs);
      }
    });
  }

  public async openAndExpectBlocked(options: OpenAndExpectBlockedOptions): Promise<void> {
    await this.withSessionRetry(async () => {
      const driver = this.getDriver();
      const timeoutMs = options.timeoutMs ?? DEFAULT_BLOCKED_TIMEOUT_MS;
      try {
        await driver.get(options.url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes('about:neterror') ||
          message.includes('dnsNotFound') ||
          message.includes('NS_ERROR_UNKNOWN_HOST') ||
          message.includes('Reached error page')
        ) {
          return;
        }
        throw error;
      }

      if (options.forbiddenSelector !== undefined) {
        const found = await driver.wait(
          async () => {
            const elements = await driver.findElements(By.css(options.forbiddenSelector ?? 'body'));
            return elements.length === 0;
          },
          timeoutMs,
          `Expected selector ${options.forbiddenSelector} to remain absent for blocked page`
        );
        assert.strictEqual(found, true);
        return;
      }

      if (options.forbiddenText !== undefined) {
        const body = await driver.findElement(By.css('body'));
        const bodyText = await body.getText();
        assert.ok(!bodyText.includes(options.forbiddenText));
        return;
      }

      const pageSource = await driver.getPageSource();
      assert.ok(
        !pageSource.includes('id="page-status">ok<') &&
          !pageSource.includes('OpenPath Portal Fixture'),
        'Blocked navigation unexpectedly rendered the success markers'
      );
    });
  }

  public async waitForBlockedScreen(expectation: BlockedScreenExpectation = {}): Promise<void> {
    const driver = this.getDriver();
    const timeoutMs = expectation.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    await driver.wait(async () => {
      const currentUrl = await driver.getCurrentUrl();
      const title = await driver.getTitle();
      return (
        currentUrl.includes('/blocked/blocked.html') ||
        currentUrl.includes('about:neterror?e=blockedByPolicy') ||
        title.includes('Blocked Page')
      );
    }, timeoutMs);

    const currentUrl = await driver.getCurrentUrl();
    if (currentUrl.includes('/blocked/blocked.html') && expectation.reasonPrefix !== undefined) {
      const url = new URL(currentUrl);
      const errorValue = url.searchParams.get('error') ?? '';
      assert.ok(
        errorValue.startsWith(expectation.reasonPrefix),
        `Expected blocked-screen error to start with ${expectation.reasonPrefix}, received ${errorValue}`
      );
    }
  }

  public async openAndExpectBlockedScreen(
    url: string,
    expectation: BlockedScreenExpectation = {}
  ): Promise<void> {
    await this.withSessionRetry(async () => {
      const driver = this.getDriver();
      try {
        await driver.get(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('blockedByPolicy') && !message.includes('Reached error page')) {
          throw error;
        }
      }

      await this.waitForBlockedScreen(expectation);
    });
  }

  public async waitForDomStatus(
    selector: string,
    expectedValue: string,
    options: ConvergenceOptions = {}
  ): Promise<void> {
    const driver = this.getDriver();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const element = await driver.wait(until.elementLocated(By.css(selector)), timeoutMs);
    await driver.wait(async () => {
      const text = (await element.getText()).trim();
      return text === expectedValue;
    }, timeoutMs);
  }

  public async assertDnsBlocked(hostname: string): Promise<void> {
    const command = isWindows()
      ? `powershell -NoLogo -Command "$result = Resolve-DnsName -Name '${hostname}' -Server 127.0.0.1 -DnsOnly -ErrorAction SilentlyContinue; if ($result) { $result | ForEach-Object { $_.IPAddress } }"`
      : `sh -c "dig @127.0.0.1 ${hostname} +short +time=3 || true"`;

    const output = await runPlatformCommand(command);
    const normalized = output.trim();
    const fixtureIp = getFixtureIpForHostname(hostname);
    assert.ok(
      normalized === '' ||
        normalized === '0.0.0.0' ||
        (fixtureIp !== null && normalized !== fixtureIp),
      `Expected DNS for ${hostname} to be blocked, received: ${normalized}`
    );
  }

  public async assertDnsAllowed(hostname: string): Promise<void> {
    const command = isWindows()
      ? `powershell -NoLogo -Command "$result = Resolve-DnsName -Name '${hostname}' -Server 127.0.0.1 -DnsOnly -ErrorAction Stop; $result | Where-Object { $_.IPAddress } | ForEach-Object { $_.IPAddress }"`
      : `sh -c "dig @127.0.0.1 ${hostname} +short +time=3 || true"`;

    const output = await runPlatformCommand(command);
    const normalized = output.trim();
    const fixtureIp = getFixtureIpForHostname(hostname);
    assert.ok(
      normalized !== '' &&
        normalized !== '0.0.0.0' &&
        (fixtureIp === null || normalized === fixtureIp),
      `Expected DNS for ${hostname} to be allowed, received: ${normalized}`
    );
  }

  public async assertWhitelistContains(hostname: string): Promise<void> {
    const contents = await readWhitelistFile();
    assert.match(contents, new RegExp(`(^|\\n)${escapeRegExp(hostname)}($|\\n)`));
  }

  public async assertWhitelistMissing(hostname: string): Promise<void> {
    const contents = await readWhitelistFile();
    assert.doesNotMatch(contents, new RegExp(`(^|\\n)${escapeRegExp(hostname)}($|\\n)`));
  }

  public async refreshBlockedPathRules(): Promise<void> {
    const driver = this.getDriver();
    await this.openPopupContext();
    const result = (await driver.executeAsyncScript(
      `const done = arguments[arguments.length - 1];
       Promise.resolve(browser.runtime.sendMessage({ action: 'refreshBlockedPathRules', tabId: 0 }))
         .then((value) => done({ ok: true, value }))
         .catch((error) => done({ ok: false, error: String(error) }));`
    )) as { ok: boolean; value?: { success?: boolean; error?: string }; error?: string };

    if (!result.ok) {
      throw new Error(`Failed to refresh blocked-path rules: ${result.error ?? 'unknown error'}`);
    }

    if (result.value?.success !== true) {
      throw new Error(
        `Blocked-path refresh was rejected: ${result.value?.error ?? 'unknown runtime error'}`
      );
    }
  }

  public async forceLocalUpdate(): Promise<void> {
    await runPlatformCommand(getUpdateCommand());
  }

  public async withSseDisabled<T>(callback: () => Promise<T>): Promise<T> {
    await runPlatformCommand(getDisableSseCommand());
    try {
      return await callback();
    } finally {
      await runPlatformCommand(getEnableSseCommand());
    }
  }

  public async saveDiagnostics(name: string): Promise<void> {
    const driver = this.getDriver();
    const screenshotPath = path.join(this.diagnosticsDir, `${name}.png`);
    const htmlPath = path.join(this.diagnosticsDir, `${name}.html`);
    const jsonPath = path.join(this.diagnosticsDir, `${name}.json`);
    const screenshot = await driver.takeScreenshot();
    await fs.writeFile(screenshotPath, screenshot, 'base64');
    await fs.writeFile(htmlPath, await driver.getPageSource(), 'utf8');
    await fs.writeFile(
      jsonPath,
      JSON.stringify(
        {
          currentUrl: await driver.getCurrentUrl(),
          title: await driver.getTitle(),
          mode: getPolicyMode(),
        },
        null,
        2
      ),
      'utf8'
    );
  }

  public async find(selector: string): Promise<WebElement> {
    return this.getDriver().findElement(By.css(selector));
  }

  public async waitForConvergence(
    assertion: () => Promise<void>,
    options: ConvergenceOptions = {}
  ): Promise<void> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
    const deadline = Date.now() + timeoutMs;
    let lastError: Error | null = null;

    while (Date.now() < deadline) {
      try {
        await assertion();
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await new Promise((resolve) => {
          setTimeout(resolve, pollMs);
        });
      }
    }

    throw lastError ?? new Error('Timed out waiting for convergence');
  }

  public async sendRuntimeMessage<T>(message: Record<string, unknown>): Promise<T> {
    const driver = this.getDriver();
    await this.openPopupContext();
    const result = (await driver.executeAsyncScript(
      `const [payload, done] = [arguments[0], arguments[arguments.length - 1]];
       Promise.resolve(browser.runtime.sendMessage(payload))
         .then((value) => done({ ok: true, value }))
         .catch((error) => done({ ok: false, error: String(error) }));`,
      message
    )) as { ok: boolean; value?: T; error?: string };

    if (!result.ok) {
      throw new Error(result.error ?? 'Unknown browser.runtime.sendMessage failure');
    }

    return result.value as T;
  }

  public async getActiveTabId(): Promise<number> {
    const driver = this.getDriver();
    await this.openPopupContext();
    const result = (await driver.executeAsyncScript(
      `const done = arguments[arguments.length - 1];
       browser.tabs.query({ active: true, currentWindow: true })
         .then((tabs) => done(tabs[0]?.id ?? null))
         .catch(() => done(null));`
    )) as number | null;

    if (result === null) {
      throw new Error('Could not resolve active browser tab ID');
    }

    return result;
  }

  public async getDomainStatuses(): Promise<Record<string, DomainStatusPayload>> {
    const payload = (await this.sendRuntimeMessage<RuntimeResponse<never>>({
      action: 'getDomainStatuses',
      tabId: await this.getActiveTabId(),
    })) as RuntimeResponse<never>;
    return payload.statuses ?? {};
  }

  public async getBlockedPathRulesDebug(): Promise<{
    version: string;
    count: number;
    rawRules: string[];
    compiledPatterns: string[];
  }> {
    const payload = await this.sendRuntimeMessage<RuntimeResponse<never>>({
      action: 'getBlockedPathRulesDebug',
      tabId: 0,
    });

    return {
      version: payload.version ?? '',
      count: payload.count ?? 0,
      rawRules: payload.rawRules ?? [],
      compiledPatterns: payload.compiledPatterns ?? [],
    };
  }

  public async getNativeBlockedPathsDebug(): Promise<{
    success: boolean;
    count: number;
    paths: string[];
    source?: string;
    error?: string;
  }> {
    const payload = await this.sendRuntimeMessage<RuntimeResponse<never>>({
      action: 'getNativeBlockedPathsDebug',
      tabId: 0,
    });

    return {
      success: payload.success === true,
      count: payload.count ?? 0,
      paths: (payload as RuntimeResponse<never> & { paths?: string[] }).paths ?? [],
      source: (payload as RuntimeResponse<never> & { source?: string }).source,
      error: payload.error,
    };
  }

  public async evaluateBlockedPathDebug(url: string, type: string): Promise<unknown> {
    const payload = await this.sendRuntimeMessage<RuntimeResponse<never> & { outcome?: unknown }>({
      action: 'evaluateBlockedPathDebug',
      tabId: 0,
      url,
      type,
    });

    return payload.outcome ?? null;
  }

  public async runCrossOriginFetchProbe(targetUrl: string): Promise<'ok' | 'blocked'> {
    const driver = this.getDriver();
    return (await driver.executeAsyncScript(
      `const [url, done] = [arguments[0], arguments[arguments.length - 1]];
       fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store' })
         .then((response) => done(response.ok ? 'ok' : 'blocked'))
         .catch(() => done('blocked'));`,
      targetUrl
    )) as 'ok' | 'blocked';
  }

  public async rerunPortalSubdomainProbe(): Promise<void> {
    const driver = this.getDriver();
    await driver.executeScript('return window.runSubdomainProbe && window.runSubdomainProbe();');
  }

  public async rerunIframeProbe(): Promise<void> {
    const driver = this.getDriver();
    await driver.executeScript('return window.runIframeProbe && window.runIframeProbe();');
  }

  public async rerunXhrProbe(): Promise<void> {
    const driver = this.getDriver();
    await driver.executeScript('return window.runXhrProbe && window.runXhrProbe();');
  }

  public async rerunFetchProbe(): Promise<void> {
    const driver = this.getDriver();
    await driver.executeScript('return window.runFetchProbe && window.runFetchProbe();');
  }

  public async assertHttpReachable(url: string): Promise<void> {
    await runPlatformCommand(`curl -fsS ${shellEscape(url)} >/dev/null`);
  }

  public async assertHttpBlocked(url: string): Promise<void> {
    try {
      await runPlatformCommand(`curl -fsS ${shellEscape(url)} >/dev/null`);
    } catch {
      return;
    }

    throw new Error(`Expected HTTP access to be blocked for ${url}`);
  }

  private async openPopupContext(): Promise<void> {
    const driver = this.getDriver();
    try {
      await driver.get(buildPopupUrl(this.getExtensionUuid()));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Navigation timed out')) {
        throw error;
      }
    }
  }

  private async withSessionRetry<T>(callback: () => Promise<T>): Promise<T> {
    try {
      return await callback();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('NoSuchSession')) {
        throw error;
      }

      await this.restart();
      return callback();
    }
  }
}

class StudentPolicyServerClient {
  private readonly scenario: StudentScenario;

  public constructor(scenario: StudentScenario) {
    this.scenario = scenario;
  }

  private get apiUrl(): string {
    return normalizeUrl(this.scenario.apiUrl);
  }

  private async trpcMutate<T>(procedure: string, input: unknown, accessToken: string): Promise<T> {
    const response = await fetch(`${this.apiUrl}/trpc/${procedure}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(input),
    });

    return parseTrpcResponse<T>(response, procedure);
  }

  private async trpcQuery<T>(procedure: string, input: unknown, accessToken?: string): Promise<T> {
    const response = await fetch(
      `${this.apiUrl}/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`,
      {
        headers: accessToken === undefined ? {} : { Authorization: `Bearer ${accessToken}` },
      }
    );

    return parseTrpcResponse<T>(response, procedure);
  }

  private async postJson<T>(pathName: string, body: unknown, accessToken?: string): Promise<T> {
    const response = await fetch(`${this.apiUrl}${pathName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken === undefined ? {} : { Authorization: `Bearer ${accessToken}` }),
      },
      body: JSON.stringify(body),
    });

    return parseJsonResponse<T>(response);
  }

  private async postJsonAllowingError<T>(
    pathName: string,
    body: unknown,
    accessToken?: string
  ): Promise<T> {
    const response = await fetch(`${this.apiUrl}${pathName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken === undefined ? {} : { Authorization: `Bearer ${accessToken}` }),
      },
      body: JSON.stringify(body),
    });

    return parseJsonBody<T>(response);
  }

  public async submitManualRequest(
    domain: string,
    reason: string
  ): Promise<RequestSubmissionResult> {
    return this.postJsonAllowingError<RequestSubmissionResult>('/api/requests/submit', {
      domain,
      hostname: this.scenario.machine.reportedHostname,
      token: this.scenario.machine.machineToken,
      reason,
      origin_page: buildFixtureUrl(this.scenario.fixtures.portal, '/ok'),
    });
  }

  public async submitAutoRequest(domain: string, reason: string): Promise<RequestSubmissionResult> {
    return this.postJsonAllowingError<RequestSubmissionResult>('/api/requests/auto', {
      domain,
      hostname: this.scenario.machine.reportedHostname,
      token: this.scenario.machine.machineToken,
      reason,
      origin_page: buildFixtureUrl(this.scenario.fixtures.site, '/ok'),
    });
  }

  public async getRequestStatus(requestId: string): Promise<RequestStatusResult> {
    return this.trpcQuery<RequestStatusResult>('requests.getStatus', { id: requestId });
  }

  public async approveRequest(requestId: string, groupId: string): Promise<void> {
    await this.trpcMutate(
      'requests.approve',
      { id: requestId, groupId },
      this.scenario.auth.teacher.accessToken
    );
  }

  public async rejectRequest(requestId: string, reason: string): Promise<void> {
    await this.trpcMutate(
      'requests.reject',
      { id: requestId, reason },
      this.scenario.auth.teacher.accessToken
    );
  }

  public async createGroupRule(
    groupId: string,
    type: string,
    value: string,
    comment: string
  ): Promise<RuleResult> {
    return this.trpcMutate<RuleResult>(
      'groups.createRule',
      { groupId, type, value, comment },
      this.scenario.auth.teacher.accessToken
    );
  }

  public async ensureWhitelistRule(groupId: string, value: string, comment: string): Promise<void> {
    try {
      await this.createGroupRule(groupId, 'whitelist', value, comment);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isRuleAlreadyPresent(message)) {
        throw error;
      }
    }
  }

  public async deleteGroupRule(ruleId: string, groupId?: string): Promise<void> {
    await this.trpcMutate(
      'groups.deleteRule',
      { id: ruleId, ...(groupId === undefined ? {} : { groupId }) },
      this.scenario.auth.teacher.accessToken
    );
  }

  public async createTemporaryExemption(scheduleId: string): Promise<ExemptionResult> {
    return this.trpcMutate<ExemptionResult>(
      'classrooms.createExemption',
      {
        machineId: this.scenario.machine.id,
        classroomId: this.scenario.classroom.id,
        scheduleId,
      },
      this.scenario.auth.teacher.accessToken
    );
  }

  public async deleteTemporaryExemption(exemptionId: string): Promise<void> {
    await this.trpcMutate(
      'classrooms.deleteExemption',
      { id: exemptionId },
      this.scenario.auth.teacher.accessToken
    );
  }

  public async setActiveGroup(groupId: string | null): Promise<string | null> {
    const result = await this.trpcMutate<{ currentGroupId: string | null }>(
      'classrooms.setActiveGroup',
      { id: this.scenario.classroom.id, groupId },
      this.scenario.auth.teacher.accessToken
    );
    return result.currentGroupId;
  }

  public async setAutoApprove(enabled: boolean): Promise<void> {
    await this.postJson(
      '/api/test-support/auto-approve',
      { enabled },
      this.scenario.auth.teacher.accessToken
    );
  }

  public async tickBoundaries(at: string): Promise<void> {
    await this.postJson(
      '/api/test-support/tick-boundaries',
      { at },
      this.scenario.auth.teacher.accessToken
    );
  }

  public async setTestClock(at: string | null): Promise<void> {
    await this.postJson('/api/test-support/clock', { at }, this.scenario.auth.teacher.accessToken);
  }

  public async getMachineContext(): Promise<unknown> {
    const response = await fetch(
      `${this.apiUrl}/api/test-support/machine-context/${encodeURIComponent(this.scenario.machine.machineHostname)}`,
      {
        headers: {
          Authorization: `Bearer ${this.scenario.auth.teacher.accessToken}`,
        },
      }
    );

    return parseJsonResponse<unknown>(response);
  }

  public async fetchMachineWhitelist(): Promise<string> {
    const response = await fetch(this.scenario.machine.whitelistUrl);
    if (!response.ok) {
      throw new Error(`Whitelist fetch failed with status ${response.status}`);
    }
    return response.text();
  }
}

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
    await forceConvergence();
    await runAssertion();
    return;
  }

  try {
    await runAssertion();
  } catch (error) {
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

  await client.ensureWhitelistRule(
    restrictedGroupId,
    driver.scenario.fixtures.portal,
    'Student policy portal baseline'
  );
  await client.ensureWhitelistRule(
    restrictedGroupId,
    driver.scenario.fixtures.cdnPortal,
    'Student policy CDN baseline'
  );
  await client.ensureWhitelistRule(
    restrictedGroupId,
    driver.scenario.fixtures.site,
    'Student policy site baseline'
  );
  await client.ensureWhitelistRule(
    restrictedGroupId,
    driver.scenario.fixtures.apiSite,
    'Student policy API site baseline'
  );
  await client.ensureWhitelistRule(
    restrictedGroupId,
    targets.hosts.baseOnly,
    'Restricted-only host baseline'
  );

  await client.ensureWhitelistRule(
    alternateGroupId,
    driver.scenario.fixtures.portal,
    'Student policy portal baseline (alternate)'
  );
  await client.ensureWhitelistRule(
    alternateGroupId,
    driver.scenario.fixtures.cdnPortal,
    'Student policy CDN baseline (alternate)'
  );
  await client.ensureWhitelistRule(
    alternateGroupId,
    driver.scenario.fixtures.site,
    'Student policy site baseline (alternate)'
  );
  await client.ensureWhitelistRule(
    alternateGroupId,
    driver.scenario.fixtures.apiSite,
    'Student policy API site baseline (alternate)'
  );
  await client.ensureWhitelistRule(
    alternateGroupId,
    targets.hosts.alternateOnly,
    'Alternate-only host baseline'
  );

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
  await driver.openAndExpectBlocked({
    url: targets.requestDomainUrl,
    forbiddenText: 'Site Fixture',
  });

  const pending = await client.submitManualRequest(
    targets.hosts.request,
    'Request host needed for lesson flow'
  );
  assert.strictEqual(pending.success, true);
  assert.ok(pending.id !== undefined);
  const pendingStatus = await client.getRequestStatus(pending.id ?? '');
  assert.strictEqual(pendingStatus.status, 'pending');
  await driver.openAndExpectBlocked({
    url: targets.requestDomainUrl,
    forbiddenText: 'Site Fixture',
  });

  await client.approveRequest(pending.id ?? '', driver.scenario.groups.restricted.id);
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

async function runStudentPolicyMatrix(
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

async function runStudentPolicyMatrixPhaseTwo(
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

export async function runStudentPolicySuite(
  options: StudentPolicyDriverOptions = {}
): Promise<RunResult> {
  const scenario = await loadScenarioFromEnv();
  const client = new StudentPolicyServerClient(scenario);
  const mode = getPolicyMode();
  const diagnosticsDir =
    options.diagnosticsDir ??
    optionalEnv('OPENPATH_STUDENT_DIAGNOSTICS_DIR') ??
    getDiagnosticsDir();

  const runPhase = async (
    phaseName: string,
    runner: (driver: StudentPolicyDriver) => Promise<void>,
    options2: { useBrowser?: boolean } = {}
  ): Promise<void> => {
    const driver = new StudentPolicyDriver(scenario, {
      ...options,
      diagnosticsDir,
    });

    try {
      if (options2.useBrowser !== false) {
        await driver.setup();
      }
      if (mode === 'fallback') {
        await driver.withSseDisabled(async () => {
          await runner(driver);
        });
      } else {
        await runner(driver);
      }
    } catch (error) {
      try {
        await driver.saveDiagnostics(`student-policy-${phaseName}-failure`);
      } catch {
        // Best effort diagnostics.
      }
      throw error;
    } finally {
      await driver.teardown();
    }
  };

  try {
    await runPhase('phase-one', async (driver) => {
      await runStudentPolicyMatrix(client, driver, mode);
    });
    await runPhase(
      'phase-two',
      async (driver) => {
        await runStudentPolicyMatrixPhaseTwo(client, driver, mode);
      },
      { useBrowser: false }
    );
    return { success: true, diagnosticsDir };
  } catch (error) {
    throw error;
  }
}

if (require.main === module) {
  runStudentPolicySuite()
    .then((result) => {
      process.stdout.write(
        `Student policy Selenium readiness passed. Diagnostics: ${result.diagnosticsDir}\n`
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
      process.stderr.write(`${message}\n`);
      process.exit(1);
    });
}
