import { test } from 'node:test';
import assert from 'node:assert/strict';

import DomainEventsService from '../src/services/domain-events.service.js';

void test('domain-events service exposes event dispatch functions', () => {
  assert.equal(typeof DomainEventsService.createDispatcher, 'function');
  assert.equal(typeof DomainEventsService.publishWhitelistChanged, 'function');
  assert.equal(typeof DomainEventsService.publishAllWhitelistsChanged, 'function');
  assert.equal(typeof DomainEventsService.publishClassroomChanged, 'function');
  assert.equal(typeof DomainEventsService.tickScheduleBoundaryEvents, 'function');
  assert.equal(typeof DomainEventsService.withQueuedEvents, 'function');
  assert.equal(typeof DomainEventsService.withTransactionEvents, 'function');
});

void test('withTransactionEvents publishes queued events after success', async () => {
  const published: string[] = [];

  const dispatcher = DomainEventsService.createDispatcher({
    publishWhitelistChanged: (groupId) => {
      published.push(groupId);
    },
  });

  const result = await DomainEventsService.withTransactionEvents(
    (operation) => operation({} as never),
    (_tx, events) => {
      events.publishWhitelistChanged('group-a');
      events.publishWhitelistChanged('group-b');
      return Promise.resolve('ok');
    },
    dispatcher
  );

  assert.equal(result, 'ok');
  assert.deepEqual(published, ['group-a', 'group-b']);
});

void test('withTransactionEvents does not publish queued events after failure', async () => {
  const published: string[] = [];

  const dispatcher = DomainEventsService.createDispatcher({
    publishWhitelistChanged: (groupId) => {
      published.push(groupId);
    },
  });

  await assert.rejects(
    () =>
      DomainEventsService.withTransactionEvents(
        (operation) => operation({} as never),
        (_tx, events) => {
          events.publishWhitelistChanged('group-a');
          return Promise.reject(new Error('rollback'));
        },
        dispatcher
      ),
    /rollback/
  );

  assert.deepEqual(published, []);
});
