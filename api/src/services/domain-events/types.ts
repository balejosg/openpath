import type { DbExecutor } from '../../db/index.js';

export type DomainEvent =
  | { type: 'whitelist.changed'; groupId: string }
  | { type: 'whitelists.allChanged' }
  | { type: 'classroom.changed'; classroomId: string; now?: Date };

export interface DomainEventPublishers {
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

export type DbDomainTransactionRunner<TResult> = (
  operation: (tx: DbExecutor) => Promise<TResult>
) => Promise<TResult>;
