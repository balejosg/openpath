import {
  emitAllWhitelistsChanged,
  emitClassroomChanged,
  emitWhitelistChanged,
  runScheduleBoundaryTickOnce,
} from '../lib/rule-events.js';
import type { DbExecutor } from '../db/index.js';

export type DomainEvent =
  | { type: 'whitelist.changed'; groupId: string }
  | { type: 'whitelists.allChanged' }
  | { type: 'classroom.changed'; classroomId: string; now?: Date };

interface DomainEventPublishers {
  publishAllWhitelistsChanged?: () => void;
  publishClassroomChanged?: (classroomId: string, now?: Date) => void;
  publishWhitelistChanged?: (groupId: string) => void;
}

export interface DomainEventDispatcher {
  publish: (event: DomainEvent) => void;
  publishBatch: (events: DomainEvent[]) => void;
}

export interface DomainEventCollector {
  publish: (event: DomainEvent) => void;
  publishAllWhitelistsChanged: () => void;
  publishClassroomChanged: (classroomId: string, now?: Date) => void;
  publishWhitelistChanged: (groupId: string) => void;
}

interface EventQueue {
  classroomChanged: Map<string, DomainEvent>;
  hasAllWhitelistsChanged: boolean;
  orderedKeys: string[];
  whitelistChanged: Map<string, DomainEvent>;
}

const defaultPublishers: Required<DomainEventPublishers> = {
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

  return {
    publish(event: DomainEvent): void {
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
    },

    publishBatch(events: DomainEvent[]): void {
      for (const event of events) {
        this.publish(event);
      }
    },
  };
}

function createCollector(dispatcher: DomainEventDispatcher): {
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

  function normalizeEvents(): DomainEvent[] {
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
      dispatcher.publishBatch(normalizeEvents());
    },
  };
}

const defaultDispatcher = createDispatcher();

export function publishWhitelistChanged(groupId: string): void {
  defaultDispatcher.publish({ type: 'whitelist.changed', groupId });
}

export function publishAllWhitelistsChanged(): void {
  defaultDispatcher.publish({ type: 'whitelists.allChanged' });
}

export function publishClassroomChanged(classroomId: string, now?: Date): void {
  defaultDispatcher.publish(
    now === undefined
      ? { type: 'classroom.changed', classroomId }
      : { type: 'classroom.changed', classroomId, now }
  );
}

export async function withQueuedEvents<T>(
  operation: (collector: DomainEventCollector) => Promise<T>,
  dispatcher: DomainEventDispatcher = defaultDispatcher
): Promise<T> {
  const { collector, flush } = createCollector(dispatcher);
  const result = await operation(collector);
  flush();
  return result;
}

export async function withTransactionEvents<TTx, TResult>(
  transactionRunner: (operation: (tx: TTx) => Promise<TResult>) => Promise<TResult>,
  operation: (tx: TTx, collector: DomainEventCollector) => Promise<TResult>,
  dispatcher: DomainEventDispatcher = defaultDispatcher
): Promise<TResult> {
  const { collector, flush } = createCollector(dispatcher);
  const result = await transactionRunner((tx) => operation(tx, collector));
  flush();
  return result;
}

export async function withDbTransactionEvents<TResult>(
  transactionRunner: (operation: (tx: DbExecutor) => Promise<TResult>) => Promise<TResult>,
  operation: (tx: DbExecutor, collector: DomainEventCollector) => Promise<TResult>,
  dispatcher: DomainEventDispatcher = defaultDispatcher
): Promise<TResult> {
  return withTransactionEvents(transactionRunner, operation, dispatcher);
}

export async function tickScheduleBoundaryEvents(now: Date): Promise<void> {
  await runScheduleBoundaryTickOnce(now);
}

export default {
  createDispatcher,
  publishWhitelistChanged,
  publishAllWhitelistsChanged,
  publishClassroomChanged,
  tickScheduleBoundaryEvents,
  withDbTransactionEvents,
  withQueuedEvents,
  withTransactionEvents,
};
