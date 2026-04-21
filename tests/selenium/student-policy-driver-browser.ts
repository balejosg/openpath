import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert';

import { By, until } from 'selenium-webdriver';

import {
  DEFAULT_BLOCKED_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  getPolicyMode,
} from './student-policy-env';
import type {
  BlockedScreenExpectation,
  BlockedScreenRequestOptions,
  ConvergenceOptions,
  OpenAndExpectBlockedOptions,
  OpenAndExpectLoadedOptions,
} from './student-policy-types';
import type { StudentPolicyDriverState } from './student-policy-driver-state';

export async function openAndExpectLoaded(
  state: StudentPolicyDriverState,
  options: OpenAndExpectLoadedOptions
): Promise<void> {
  const driver = state.getDriver();
  await driver.get(options.url);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (options.title !== undefined) {
    await driver.wait(until.titleContains(options.title), timeoutMs);
  }

  if (options.selector !== undefined) {
    await driver.wait(until.elementLocated(By.css(options.selector)), timeoutMs);
  }
}

export async function openAndExpectBlocked(
  state: StudentPolicyDriverState,
  options: OpenAndExpectBlockedOptions
): Promise<void> {
  const driver = state.getDriver();
  const timeoutMs = options.timeoutMs ?? DEFAULT_BLOCKED_TIMEOUT_MS;
  try {
    await driver.get(options.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('about:neterror') ||
      message.includes('dnsNotFound') ||
      message.includes('NS_ERROR_UNKNOWN_HOST') ||
      message.includes('Reached error page') ||
      message.includes('Navigation timed out')
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
    !pageSource.includes('id="page-status">ok<') && !pageSource.includes('OpenPath Portal Fixture'),
    'Blocked navigation unexpectedly rendered the success markers'
  );
}

export async function waitForBlockedScreen(
  state: StudentPolicyDriverState,
  expectation: BlockedScreenExpectation = {}
): Promise<void> {
  const driver = state.getDriver();
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

export async function submitBlockedScreenRequest(
  state: StudentPolicyDriverState,
  options: BlockedScreenRequestOptions
): Promise<string> {
  const driver = state.getDriver();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const reasonInput = await driver.findElement(By.css('#request-reason'));
  const submitButton = await driver.findElement(By.css('#submit-unblock-request'));

  await reasonInput.clear();
  await reasonInput.sendKeys(options.reason);
  await submitButton.click();

  let latestStatus = '';
  try {
    await driver.wait(async () => {
      const statusElement = await driver.findElement(By.css('#request-status'));
      latestStatus = (await statusElement.getText()).trim();
      return /Solicitud enviada|Request submitted/i.test(latestStatus);
    }, timeoutMs);
  } catch (error) {
    const currentUrl = await driver.getCurrentUrl().catch(() => '<unavailable>');
    const title = await driver.getTitle().catch(() => '<unavailable>');
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        message,
        `latest #request-status: ${latestStatus || '<empty>'}`,
        `currentUrl: ${currentUrl}`,
        `title: ${title}`,
      ].join('; ')
    );
  }

  return latestStatus;
}

export async function waitForDomStatus(
  state: StudentPolicyDriverState,
  selector: string,
  expectedValue: string,
  options: ConvergenceOptions = {}
): Promise<void> {
  const driver = state.getDriver();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const element = await driver.wait(until.elementLocated(By.css(selector)), timeoutMs);
  await driver.wait(async () => {
    const text = (await element.getText()).trim();
    return text === expectedValue;
  }, timeoutMs);
}

export async function saveDiagnostics(
  state: StudentPolicyDriverState,
  name: string
): Promise<void> {
  const driver = state.getDriver();
  const screenshotPath = path.join(state.diagnosticsDir, `${name}.png`);
  const htmlPath = path.join(state.diagnosticsDir, `${name}.html`);
  const jsonPath = path.join(state.diagnosticsDir, `${name}.json`);
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
