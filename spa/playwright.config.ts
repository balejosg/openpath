import { defineConfig, devices } from '@playwright/test';

/**
 * OpenPath SPA - Playwright E2E Configuration
 *
 * Tests require:
 * - API server running on port 3001
 * - SPA served (can use simple http-server or the API serves static files)
 */
export default defineConfig({
    testDir: './e2e',
    globalSetup: './e2e/global-setup.ts',

    // Run tests in parallel
    fullyParallel: true,

    // Fail on CI if you accidentally left test.only
    forbidOnly: !!process.env['CI'],

    // Visual regression settings
    expect: {
        toHaveScreenshot: {
            threshold: 0.2,
            maxDiffPixelRatio: 0.01,
        },
    },

    // Retry on CI only
    retries: process.env['CI'] ? 2 : 0,

    // Run tests with 2 workers on CI for better performance
    ...(process.env['CI'] ? { workers: 2 } : {}),

    // Reporter: blob for sharding merge + github for CI annotations
    reporter: process.env['CI'] ? [['blob'], ['github']] : 'html',

    // Shared settings for all projects
    use: {
        // Base URL for navigation
        baseURL: process.env['BASE_URL'] ?? 'http://localhost:3005',

        // Collect trace on first retry
        trace: 'on-first-retry',

        // Screenshot on failure
        screenshot: 'only-on-failure',

        // Video on failure (for debugging)
        video: 'retain-on-failure',
    },

    // Configure projects for different browsers
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        // Mobile viewport for responsive tests
        {
            name: 'Mobile Chrome',
            use: { ...devices['Pixel 5'] },
        },
    ],

    // Run local server before tests
    webServer: {
        command: 'cd ../api && PORT=3005 NODE_ENV=test npm start',
        url: 'http://localhost:3005/health',
        reuseExistingServer: true,
        timeout: 120 * 1000,
    },
});
