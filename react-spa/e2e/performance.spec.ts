/**
 * Performance E2E Tests for OpenPath
 *
 * Tests page load times, memory usage, and responsiveness.
 */

import { test, expect } from '@playwright/test';
import {
  loginAsAdmin,
  waitForNetworkIdle,
  measurePageLoad,
  getPerformanceMetrics,
} from './fixtures/test-utils';

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  loginPageLoad: 3000, // Login page should load in under 3s
  dashboardLoad: 5000, // Dashboard with data under 5s
  groupsLoad: 4000, // Groups list under 4s
  requestsLoad: 4000, // Requests list under 4s
  firstPaint: 1500, // First paint under 1.5s
  domContentLoaded: 3000, // DOM ready under 3s
  interactiveTime: 4000, // Time to interactive under 4s
};

test.describe('Page Load Performance', () => {
  test('login page loads within threshold @performance @slow', async ({ page }) => {
    const loadTime = await measurePageLoad(page, './');

    console.log(`Login page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(THRESHOLDS.loginPageLoad);
  });

  test('dashboard loads within threshold @performance @slow', async ({ page }) => {
    await loginAsAdmin(page);

    const start = Date.now();
    await page.goto('./dashboard');
    await waitForNetworkIdle(page);
    const loadTime = Date.now() - start;

    console.log(`Dashboard load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(THRESHOLDS.dashboardLoad);
  });

  test('groups page loads within threshold @performance @slow', async ({ page }) => {
    await loginAsAdmin(page);

    const start = Date.now();
    await page.goto('./groups');
    await waitForNetworkIdle(page);
    const loadTime = Date.now() - start;

    console.log(`Groups page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(THRESHOLDS.groupsLoad);
  });

  test('requests page loads within threshold @performance @slow', async ({ page }) => {
    await loginAsAdmin(page);

    const start = Date.now();
    await page.goto('./requests');
    await waitForNetworkIdle(page);
    const loadTime = Date.now() - start;

    console.log(`Requests page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(THRESHOLDS.requestsLoad);
  });
});

test.describe('Core Web Vitals', () => {
  test('login page meets Core Web Vitals @performance @cwv', async ({ page }) => {
    await page.goto('./');
    await waitForNetworkIdle(page);

    const metrics = await getPerformanceMetrics(page);

    console.log('Login Page Performance Metrics:', metrics);

    expect(metrics.firstPaint).toBeLessThan(THRESHOLDS.firstPaint);
    expect(metrics.domContentLoaded).toBeLessThan(THRESHOLDS.domContentLoaded);
  });

  test('dashboard meets Core Web Vitals @performance @cwv', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('./dashboard');
    await waitForNetworkIdle(page);

    const metrics = await getPerformanceMetrics(page);

    console.log('Dashboard Performance Metrics:', metrics);

    expect(metrics.firstPaint).toBeLessThan(THRESHOLDS.firstPaint);
    expect(metrics.domContentLoaded).toBeLessThan(THRESHOLDS.domContentLoaded);
  });

  test('measures Largest Contentful Paint @performance @cwv', async ({ page }) => {
    await page.goto('./');
    await waitForNetworkIdle(page);

    // Get LCP
    const lcp = await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          const lastEntry = entries[entries.length - 1];
          resolve(lastEntry?.startTime || 0);
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        // Fallback timeout
        setTimeout(() => resolve(0), 5000);
      });
    });

    console.log(`LCP: ${lcp}ms`);
    expect(Number(lcp)).toBeLessThan(2500); // Good LCP is under 2.5s
  });

  test('measures Cumulative Layout Shift @performance @cwv', async ({ page }) => {
    await page.goto('./');
    await waitForNetworkIdle(page);

    // Wait for potential layout shifts
    await page.waitForTimeout(2000);

    const cls = await page.evaluate(() => {
      return new Promise((resolve) => {
        let clsValue = 0;
        new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            // @ts-ignore
            if (!entry.hadRecentInput) {
              // @ts-ignore
              clsValue += entry.value;
            }
          }
          resolve(clsValue);
        }).observe({ type: 'layout-shift', buffered: true });

        setTimeout(() => resolve(clsValue), 3000);
      });
    });

    console.log(`CLS: ${cls}`);
    expect(Number(cls)).toBeLessThan(0.1); // Good CLS is under 0.1
  });
});

test.describe('Memory Performance', () => {
  test('no memory leaks on navigation @performance @memory', async ({ page }) => {
    await loginAsAdmin(page);

    // Get initial memory
    const getMemory = async () => {
      return await page.evaluate(() => {
        if ('memory' in performance) {
          // @ts-ignore
          return performance.memory.usedJSHeapSize;
        }
        return 0;
      });
    };

    const initialMemory = await getMemory();

    // Navigate through multiple pages
    const pages = ['./dashboard', './groups', './requests', './users'];

    for (let i = 0; i < 3; i++) {
      for (const pageUrl of pages) {
        await page.goto(pageUrl);
        await waitForNetworkIdle(page);
      }
    }

    const finalMemory = await getMemory();

    // Memory growth should be less than 50MB
    const memoryGrowth = finalMemory - initialMemory;
    console.log(`Memory growth after navigation: ${memoryGrowth / 1024 / 1024}MB`);

    // Skip if memory API not available
    if (initialMemory > 0) {
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // 50MB
    }
  });
});

test.describe('List Rendering Performance', () => {
  test('handles large domain list efficiently @performance @list', async ({ page }) => {
    await loginAsAdmin(page);

    // Mock a large list of domains
    await page.route('**/api/domains**', (route) => {
      const domains = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        domain: `domain-${i}.example.com`,
        status: i % 3 === 0 ? 'pending' : 'approved',
        createdAt: new Date().toISOString(),
      }));

      route.fulfill({
        status: 200,
        body: JSON.stringify(domains),
      });
    });

    const start = Date.now();
    await page.goto('./domains');
    await waitForNetworkIdle(page);
    const loadTime = Date.now() - start;

    console.log(`Large list render time: ${loadTime}ms`);

    // Should render in reasonable time (virtualization helps)
    expect(loadTime).toBeLessThan(8000);

    // Page should be interactive
    await expect(page.locator('body')).toBeVisible();
  });

  test('scroll performance with large list @performance @list', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('./groups');
    await waitForNetworkIdle(page);

    // Measure scroll performance
    const scrollMetrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        let frames = 0;
        let lastTime = performance.now();

        const countFrames = () => {
          frames++;
          const now = performance.now();

          if (now - lastTime < 1000) {
            requestAnimationFrame(countFrames);
          } else {
            resolve({ fps: frames });
          }
        };

        // Start scrolling
        window.scrollTo({ top: 1000, behavior: 'smooth' });
        requestAnimationFrame(countFrames);
      });
    });

    console.log('Scroll metrics:', scrollMetrics);

    // FPS should be at least 30
    // @ts-ignore
    expect(scrollMetrics.fps).toBeGreaterThan(30);
  });
});

test.describe('Bundle Size Impact', () => {
  test('initial bundle loads efficiently @performance @bundle', async ({ page }) => {
    // Track network requests
    const requests: { url: string; size: number }[] = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('.js') || url.includes('.css')) {
        const size = parseInt(response.headers()['content-length'] || '0');
        requests.push({ url, size });
      }
    });

    await page.goto('./');
    await waitForNetworkIdle(page);

    // Calculate total bundle size
    const totalJS = requests
      .filter((r) => r.url.includes('.js'))
      .reduce((sum, r) => sum + r.size, 0);

    const totalCSS = requests
      .filter((r) => r.url.includes('.css'))
      .reduce((sum, r) => sum + r.size, 0);

    console.log(`Total JS: ${totalJS / 1024}KB`);
    console.log(`Total CSS: ${totalCSS / 1024}KB`);

    // JS bundle should be under 1MB
    expect(totalJS).toBeLessThan(1024 * 1024);

    // CSS should be under 200KB
    expect(totalCSS).toBeLessThan(200 * 1024);
  });
});

test.describe('API Response Times', () => {
  test('API endpoints respond within threshold @performance @api', async ({ page }) => {
    await loginAsAdmin(page);

    const apiTimes: Record<string, number> = {};

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/') || url.includes('/trpc/')) {
        const timing = response.request().timing();
        apiTimes[url] = timing.responseEnd - timing.requestStart;
      }
    });

    await page.goto('./dashboard');
    await waitForNetworkIdle(page);

    console.log('API Response Times:', apiTimes);

    // All API calls should respond in under 2 seconds
    for (const [url, time] of Object.entries(apiTimes)) {
      if (time > 0) {
        // Skip if timing not available
        expect(time).toBeLessThan(2000);
      }
    }
  });
});
