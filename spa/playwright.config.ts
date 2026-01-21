import { defineConfig, devices } from '@playwright/test';

/**
 * OpenPath SPA - Playwright E2E Configuration
 *
 * Tests require:
 * - API server running (auto-started via webServer config)
 * - SPA served (API serves static files from dist/)
 */

const PORT = process.env['PORT'] ?? '3005';
const BASE_URL = process.env['BASE_URL'] ?? `http://localhost:${PORT}`;

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
        baseURL: BASE_URL,

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
        command: `cd ../api && npm start`,
        url: `${BASE_URL}/health`,
        reuseExistingServer: true,
        timeout: 120 * 1000,
        env: {
            PORT,
            NODE_ENV: 'test',
            ...(process.env['DB_HOST'] && { DB_HOST: process.env['DB_HOST'] }),
            ...(process.env['DB_PORT'] && { DB_PORT: process.env['DB_PORT'] }),
            ...(process.env['DB_NAME'] && { DB_NAME: process.env['DB_NAME'] }),
            ...(process.env['DB_USER'] && { DB_USER: process.env['DB_USER'] }),
            ...(process.env['DB_PASSWORD'] && { DB_PASSWORD: process.env['DB_PASSWORD'] }),
            ...(process.env['JWT_SECRET'] && { JWT_SECRET: process.env['JWT_SECRET'] }),
            ...(process.env['ADMIN_TOKEN'] && { ADMIN_TOKEN: process.env['ADMIN_TOKEN'] }),
            ...(process.env['CORS_ORIGINS'] && { CORS_ORIGINS: process.env['CORS_ORIGINS'] }),
        },
    },
});
