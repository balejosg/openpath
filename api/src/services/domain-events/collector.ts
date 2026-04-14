import type { DomainEvent, DomainEventCollector, DomainEventDispatcher } from './types.js';

interface EventQueue {
  classroomChanged: Map<string, DomainEvent>;
  hasAllWhitelistsChanged: boolean;
  orderedKeys: string[];
  whitelistChanged: Map<string, DomainEvent>;
}

function normalizeEvents(queue: EventQueue): DomainEvent[] {
  const events: DomainEvent[] = [];

  for (const key of queue.orderedKeys) {
    if (key === 'whitelists.allChanged') {
      events.push({ type: 'whitelists.allChanged' });
      continue;
    }

    if (key.startsWith('whitelist.changed:')) {
      if (queue.hasAllWhitelistsChanged) {
        continue;
      }
      const groupId = key.slice('whitelist.changed:'.length);
      const event = queue.whitelistChanged.get(groupId);
      if (event) {
        events.push(event);
      }
      continue;
    }

    if (key.startsWith('classroom.changed:')) {
      const classroomId = key.slice('classroom.changed:'.length);
      const event = queue.classroomChanged.get(classroomId);
      if (event) {
        events.push(event);
      }
    }
  }

  return events;
}

export function createCollector(dispatcher: DomainEventDispatcher): {
  collector: DomainEventCollector;
  flush: () => void;
} {
  const queue: EventQueue = {
    classroomChanged: new Map(),
    hasAllWhitelistsChanged: false,
    orderedKeys: [],
    whitelistChanged: new Map(),
  };

  function queueEvent(event: DomainEvent): void {
    switch (event.type) {
      case 'whitelist.changed':
        if (queue.hasAllWhitelistsChanged || queue.whitelistChanged.has(event.groupId)) {
          return;
        }
        queue.whitelistChanged.set(event.groupId, event);
        queue.orderedKeys.push(`whitelist.changed:${event.groupId}`);
        return;
      case 'whitelists.allChanged':
        if (queue.hasAllWhitelistsChanged) {
          return;
        }
        queue.hasAllWhitelistsChanged = true;
        queue.whitelistChanged.clear();
        queue.orderedKeys.push('whitelists.allChanged');
        return;
      case 'classroom.changed':
        if (!queue.classroomChanged.has(event.classroomId)) {
          queue.orderedKeys.push(`classroom.changed:${event.classroomId}`);
        }
        queue.classroomChanged.set(event.classroomId, event);
        return;
    }
  }

  return {
    collector: {
      publish(event: DomainEvent): void {
        queueEvent(event);
      },
      publishAllWhitelistsChanged(): void {
        queueEvent({ type: 'whitelists.allChanged' });
      },
      publishClassroomChanged(classroomId: string, now?: Date): void {
        queueEvent(
          now === undefined
            ? { type: 'classroom.changed', classroomId }
            : { type: 'classroom.changed', classroomId, now }
        );
      },
      publishWhitelistChanged(groupId: string): void {
        queueEvent({ type: 'whitelist.changed', groupId });
      },
    },
    flush(): void {
      dispatcher.publishBatch(normalizeEvents(queue));
    },
  };
}
