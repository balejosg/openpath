import {
  emitAllWhitelistsChanged,
  emitClassroomChanged,
  emitWhitelistChanged,
  runScheduleBoundaryTickOnce,
} from '../lib/rule-events.js';

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
  const queuedEvents: DomainEvent[] = [];

  return {
    collector: {
      publish(event: DomainEvent): void {
        queuedEvents.push(event);
      },
      publishAllWhitelistsChanged(): void {
        queuedEvents.push({ type: 'whitelists.allChanged' });
      },
      publishClassroomChanged(classroomId: string, now?: Date): void {
        queuedEvents.push(
          now === undefined
            ? { type: 'classroom.changed', classroomId }
            : { type: 'classroom.changed', classroomId, now }
        );
      },
      publishWhitelistChanged(groupId: string): void {
        queuedEvents.push({ type: 'whitelist.changed', groupId });
      },
    },
    flush(): void {
      dispatcher.publishBatch(queuedEvents);
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

export async function tickScheduleBoundaryEvents(now: Date): Promise<void> {
  await runScheduleBoundaryTickOnce(now);
}

export default {
  createDispatcher,
  publishWhitelistChanged,
  publishAllWhitelistsChanged,
  publishClassroomChanged,
  tickScheduleBoundaryEvents,
  withQueuedEvents,
  withTransactionEvents,
};
