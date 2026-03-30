/**
 * OpenPath API Load Tests
 *
 * Run with: k6 run load-test.js
 *
 * Options:
 *   K6_BASE_URL - API base URL (default: http://localhost:3000)
 *   K6_VUS - Number of virtual users (default: 10)
 *   K6_DURATION - Test duration (default: 30s)
 *
 * Example:
 *   K6_BASE_URL=http://api.example.com k6 run load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const healthLatency = new Trend('health_latency');
const requestsLatency = new Trend('requests_latency');

// Configuration
const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3000';
const SUMMARY_JSON_PATH = __ENV.K6_SUMMARY_JSON || 'perf-results/k6-summary.json';

export const options = {
  vus: __ENV.K6_VUS ? parseInt(__ENV.K6_VUS, 10) : 10,
  duration: __ENV.K6_DURATION || '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    errors: ['rate<0.1'], // Error rate under 10%
    health_latency: ['p(99)<100'], // Health endpoint under 100ms
    requests_latency: ['p(95)<750'], // Config endpoint under 750ms
  },
};

/**
 * Setup function - runs once before test
 */
export function setup() {
  // Verify API is reachable
  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    throw new Error(`API not reachable at ${BASE_URL}`);
  }

  return {
    baseUrl: BASE_URL,
    timestamp: Date.now(),
  };
}

/**
 * Default test scenario
 */
export default function (data) {
  const roll = Math.random();

  if (roll < 0.6) {
    testHealthEndpoint(data);
    return;
  }

  if (roll < 0.9) {
    testConfigEndpoint(data);
    return;
  }

  rateLimitTest(data);
}

function testConfigEndpoint(data) {
  const start = Date.now();
  const res = http.get(`${data.baseUrl}/api/config`, {
    tags: {
      endpoint: 'api-config',
      scenario: 'config-read',
    },
  });
  requestsLatency.add(Date.now() - start);

  const success = check(res, {
    'config: status is 200': (r) => r.status === 200,
    'config: has googleClientId': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.googleClientId !== undefined;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
  sleep(0.2);
}

function testHealthEndpoint(data) {
  const start = Date.now();
  const res = http.get(`${data.baseUrl}/health`, {
    tags: {
      endpoint: 'health',
      scenario: 'health-read',
    },
  });
  healthLatency.add(Date.now() - start);

  const success = check(res, {
    'health: status is 200': (r) => r.status === 200,
    'health: has status field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status !== undefined;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
  sleep(0.1);
}

export function rateLimitTest(data) {
  let scenarioSucceeded = true;

  for (let i = 0; i < 20; i++) {
    const res = http.get(`${data.baseUrl}/health`, {
      tags: {
        endpoint: 'health',
        scenario: 'health-burst',
      },
    });
    const success = check(res, {
      'rate limit: not server error': (r) => r.status < 500,
    });

    scenarioSucceeded = scenarioSucceeded && success;
  }

  errorRate.add(!scenarioSucceeded);
  sleep(1);
}

export function teardown(data) {
  console.log(`Test completed. Started at: ${new Date(data.timestamp).toISOString()}`);
}

function metricValue(metric, key, fallback = 'n/a') {
  const value = metric?.values?.[key];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return value.toFixed(2);
}

export function handleSummary(data) {
  const summaryLines = [
    'Load test summary',
    `Base URL: ${BASE_URL}`,
    `Iterations: ${metricValue(data.metrics.iterations, 'count', '0')}`,
    `HTTP req duration p(95): ${metricValue(data.metrics.http_req_duration, 'p(95)')} ms`,
    `Config latency p(95): ${metricValue(data.metrics.requests_latency, 'p(95)')} ms`,
    `Health latency p(99): ${metricValue(data.metrics.health_latency, 'p(99)')} ms`,
    `Error rate: ${metricValue(data.metrics.errors, 'rate')}`,
  ].join('\n');

  return {
    [SUMMARY_JSON_PATH]: JSON.stringify(data, null, 2),
    stdout: `${summaryLines}\n`,
  };
}
