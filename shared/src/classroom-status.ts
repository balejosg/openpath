export type ClassroomMachineStatus = 'online' | 'stale' | 'offline';
export type ClassroomStatus = 'operational' | 'degraded' | 'offline';

export const CLASSROOM_MACHINE_ONLINE_THRESHOLD_MINUTES = 5;
export const CLASSROOM_MACHINE_STALE_THRESHOLD_MINUTES = 15;

export function calculateClassroomMachineStatus(
  lastSeen: Date | null,
  now: Date = new Date()
): ClassroomMachineStatus {
  if (!lastSeen) return 'offline';

  const diffMs = now.getTime() - lastSeen.getTime();
  const diffMinutes = diffMs / (1000 * 60);

  if (diffMinutes <= CLASSROOM_MACHINE_ONLINE_THRESHOLD_MINUTES) return 'online';
  if (diffMinutes <= CLASSROOM_MACHINE_STALE_THRESHOLD_MINUTES) return 'stale';
  return 'offline';
}

export function calculateClassroomStatus(
  machines: { status: ClassroomMachineStatus }[]
): ClassroomStatus {
  if (machines.length === 0) return 'operational';

  const onlineCount = machines.filter((m) => m.status === 'online').length;
  const offlineCount = machines.filter((m) => m.status === 'offline').length;

  if (onlineCount === machines.length) return 'operational';
  if (offlineCount === machines.length) return 'offline';
  return 'degraded';
}

export type CurrentGroupSource = 'manual' | 'schedule' | 'default' | 'none';

export function resolveCurrentGroup(params: {
  activeGroupId: string | null;
  scheduleGroupId: string | null;
  defaultGroupId: string | null;
}): { id: string | null; source: CurrentGroupSource } {
  const { activeGroupId, scheduleGroupId, defaultGroupId } = params;

  if (activeGroupId !== null && activeGroupId.length > 0) {
    return { id: activeGroupId, source: 'manual' };
  }
  if (scheduleGroupId !== null && scheduleGroupId.length > 0) {
    return { id: scheduleGroupId, source: 'schedule' };
  }
  if (defaultGroupId !== null && defaultGroupId.length > 0) {
    return { id: defaultGroupId, source: 'default' };
  }
  return { id: null, source: 'none' };
}
