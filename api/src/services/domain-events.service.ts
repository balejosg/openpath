import {
  emitAllWhitelistsChanged,
  emitClassroomChanged,
  emitWhitelistChanged,
  runScheduleBoundaryTickOnce,
} from '../lib/rule-events.js';

export function publishWhitelistChanged(groupId: string): void {
  emitWhitelistChanged(groupId);
}

export function publishAllWhitelistsChanged(): void {
  emitAllWhitelistsChanged();
}

export function publishClassroomChanged(classroomId: string, now?: Date): void {
  emitClassroomChanged(classroomId, now);
}

export async function tickScheduleBoundaryEvents(now: Date): Promise<void> {
  await runScheduleBoundaryTickOnce(now);
}

export default {
  publishWhitelistChanged,
  publishAllWhitelistsChanged,
  publishClassroomChanged,
  tickScheduleBoundaryEvents,
};
