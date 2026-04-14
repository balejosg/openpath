import {
  emitAllWhitelistsChanged,
  emitClassroomChanged,
  emitWhitelistChanged,
} from '../../lib/rule-events.js';
import type { DomainEvent, DomainEventDispatcher, DomainEventPublishers } from './types.js';

export const defaultPublishers: Required<DomainEventPublishers> = {
  publishAllWhitelistsChanged: emitAllWhitelistsChanged,
  publishClassroomChanged: emitClassroomChanged,
  publishWhitelistChanged: emitWhitelistChanged,
};

export function createDispatcher(
  publishers: DomainEventPublishers = defaultPublishers
): DomainEventDispatcher {
  const resolvedPublishers = {
    ...defaultPublishers,
    ...publishers,
  };

  function publish(event: DomainEvent): void {
    switch (event.type) {
      case 'whitelist.changed':
        resolvedPublishers.publishWhitelistChanged(event.groupId);
        return;
      case 'whitelists.allChanged':
        resolvedPublishers.publishAllWhitelistsChanged();
        return;
      case 'classroom.changed':
        resolvedPublishers.publishClassroomChanged(event.classroomId, event.now);
        return;
    }
  }

  return {
    publish,
    publishBatch(events: DomainEvent[]): void {
      for (const event of events) {
        publish(event);
      }
    },
  };
}
