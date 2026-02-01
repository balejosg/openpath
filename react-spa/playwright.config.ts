import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration optimized for local development speed.
 * 
 * Key optimizations:
 * - fullyParallel: true - run all tests in parallel
 * - reuseExistingServer: true - don't restart API if already running
 * - Only Chromium (no Firefox/WebKit) for speed
 * - Shorter timeouts locally
 * - No retries locally (fast feedback)
 */

const isCI = !!process.env.CI;
// On CI, we use the API to serve the built React SPA at /
// In development, we can still use the Vite server on port 3001
const port = isCI ? 3000 : 3001;
const baseURL = process.env.BASE_URL || (isCI ? 'http://localhost:3000/' : 'http://localhost:3001/');

export default defineConfig({
  testDir: './e2e',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: isCI,
  
  /* Retry on CI only - fail fast locally */
  retries: isCI ? 2 : 0,
  
  /* Use all CPU cores locally, limit in CI */
  workers: isCI ? 1 : undefined,
  
  /* Reporter: minimal locally for speed, html in CI */
  reporter: isCI ? 'html' : 'list',
  
  /* Shared settings for all the projects below. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    
    /* Faster timeouts locally */
    navigationTimeout: isCI ? 30000 : 15000,
    actionTimeout: isCI ? 15000 : 10000,
  },
  
  /* Faster expect timeouts locally */
  expect: {
    timeout: isCI ? 10000 : 5000,
  },

  /* Configure projects for major browsers - only Chromium for speed */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'cd ../api && npm run dev',
      port: 3000,
      reuseExistingServer: !isCI,
      timeout: 120000,
    },
    // Only run Vite server if NOT on CI
    ...(!isCI ? [{
      command: 'npm run dev',
      port: 3001,
      reuseExistingServer: true,
      timeout: 60000,
    }] : []),
  ],
  
  /* Output directory for test artifacts */
  outputDir: './e2e/test-results',
});
