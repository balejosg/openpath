import { test } from 'node:test';
import assert from 'node:assert/strict';

import DomainEventsService from '../src/services/domain-events.service.js';

void test('domain-events service exposes event dispatch functions', () => {
  assert.equal(typeof DomainEventsService.publishWhitelistChanged, 'function');
  assert.equal(typeof DomainEventsService.publishAllWhitelistsChanged, 'function');
  assert.equal(typeof DomainEventsService.publishClassroomChanged, 'function');
  assert.equal(typeof DomainEventsService.tickScheduleBoundaryEvents, 'function');
});
