import { defineConfig, devices } from '@playwright/test';

// On CI, we use the API to serve the built React SPA at /
// In development, we can still use the Vite server on port 3001
const port = process.env.CI ? 3000 : 3001;
const baseURL = process.env.CI ? 'http://localhost:3000/' : 'http://localhost:3001/';

export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL || baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
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
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    // Only run Vite server if NOT on CI
    ...(!process.env.CI ? [{
      command: 'npm run dev',
      port: 3001,
      reuseExistingServer: true,
      timeout: 120000,
    }] : []),
  ],
});
