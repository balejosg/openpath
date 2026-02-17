import { describe, test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

import {
  CANONICAL_HEALTH_STATUSES,
  normalizeHealthActions,
  normalizeHealthStatus,
  PROBLEM_HEALTH_STATUSES,
} from '../src/lib/health-status.js';

void describe('health-status normalization', () => {
  void test('keeps canonical status values', () => {
    const normalized = normalizeHealthStatus('HEALTHY');

    assert.strictEqual(normalized.status, 'HEALTHY');
    assert.strictEqual(normalized.wasNormalized, false);
    assert.strictEqual(normalized.source, 'HEALTHY');
  });

  void test('maps legacy status values', () => {
    assert.strictEqual(normalizeHealthStatus('OK').status, 'HEALTHY');
    assert.strictEqual(normalizeHealthStatus('WARNING').status, 'DEGRADED');
    assert.strictEqual(normalizeHealthStatus('error').status, 'CRITICAL');
    assert.strictEqual(normalizeHealthStatus('RECOVERED').status, 'DEGRADED');
    assert.strictEqual(normalizeHealthStatus('FAILED').status, 'CRITICAL');
  });

  void test('maps unknown statuses to DEGRADED and tags actions', () => {
    const normalized = normalizeHealthStatus('SOMETHING_NEW');
    assert.strictEqual(normalized.status, 'DEGRADED');
    assert.strictEqual(normalized.wasNormalized, true);

    const actions = normalizeHealthActions('watchdog_repair', normalized);
    assert.ok(actions.includes('watchdog_repair'));
    assert.ok(actions.includes('status_normalized:SOMETHING_NEW->DEGRADED'));
  });

  void test('returns only normalization reason when actions are empty', () => {
    const normalized = normalizeHealthStatus('healthy');
    const actions = normalizeHealthActions('', normalized);

    assert.strictEqual(actions, 'status_normalized:healthy->HEALTHY');
  });

  void test('problem status set does not include HEALTHY', () => {
    assert.strictEqual(PROBLEM_HEALTH_STATUSES.has('HEALTHY'), false);
    assert.strictEqual(PROBLEM_HEALTH_STATUSES.has('CRITICAL'), true);
    assert.strictEqual(PROBLEM_HEALTH_STATUSES.has('DEGRADED'), true);
  });

  void test('matches shared contract fixture', () => {
    const fixturePath = new URL('../../tests/contracts/health-statuses.txt', import.meta.url);
    const expected = readFileSync(fixturePath, 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    assert.deepStrictEqual(CANONICAL_HEALTH_STATUSES, expected);
  });
});
