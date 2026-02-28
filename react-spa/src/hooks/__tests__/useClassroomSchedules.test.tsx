import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleWithPermissions } from '../../types';
import { useClassroomSchedules } from '../useClassroomSchedules';

const mockGetByClassroomQuery = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock('../../lib/trpc', () => ({
  trpc: {
    schedules: {
      getByClassroom: { query: (input: unknown): unknown => mockGetByClassroomQuery(input) },
      create: { mutate: (input: unknown): unknown => mockCreateMutate(input) },
      update: { mutate: (input: unknown): unknown => mockUpdateMutate(input) },
      delete: { mutate: (input: unknown): unknown => mockDeleteMutate(input) },
    },
  },
}));

const makeSchedule = (
  overrides: Partial<ScheduleWithPermissions> = {}
): ScheduleWithPermissions => ({
  id: 'schedule-1',
  classroomId: 'classroom-1',
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '09:00',
  groupId: 'group-1',
  teacherId: 'teacher-1',
  recurrence: undefined,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  isMine: true,
  canEdit: true,
  ...overrides,
});

describe('useClassroomSchedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByClassroomQuery.mockResolvedValue({ schedules: [makeSchedule()] });
    mockCreateMutate.mockResolvedValue(undefined);
    mockUpdateMutate.mockResolvedValue(undefined);
    mockDeleteMutate.mockResolvedValue(undefined);
  });

  it('loads schedules for selected classroom and clears when no classroom is selected', async () => {
    const { result, rerender } = renderHook(
      ({ selectedClassroomId }) => useClassroomSchedules({ selectedClassroomId }),
      { initialProps: { selectedClassroomId: 'classroom-1' as string | null } }
    );

    await waitFor(() => {
      expect(mockGetByClassroomQuery).toHaveBeenCalledWith({ classroomId: 'classroom-1' });
      expect(result.current.schedules).toHaveLength(1);
    });

    rerender({ selectedClassroomId: null });

    await waitFor(() => {
      expect(result.current.schedules).toEqual([]);
    });
  });

  it('opens create form with defaults and resets state on close', async () => {
    const { result } = renderHook(() =>
      useClassroomSchedules({ selectedClassroomId: 'classroom-1' })
    );

    await waitFor(() => {
      expect(result.current.loadingSchedules).toBe(false);
    });

    act(() => {
      result.current.openScheduleCreate(3, '09:30');
    });

    expect(result.current.scheduleFormOpen).toBe(true);
    expect(result.current.editingSchedule).toBeNull();
    expect(result.current.scheduleFormDay).toBe(3);
    expect(result.current.scheduleFormStartTime).toBe('09:30');

    act(() => {
      result.current.closeScheduleForm();
    });

    expect(result.current.scheduleFormOpen).toBe(false);
    expect(result.current.scheduleFormDay).toBeUndefined();
    expect(result.current.scheduleFormStartTime).toBeUndefined();
  });

  it('creates a schedule and refreshes list on save', async () => {
    const { result } = renderHook(() =>
      useClassroomSchedules({ selectedClassroomId: 'classroom-1' })
    );

    await waitFor(() => {
      expect(result.current.loadingSchedules).toBe(false);
    });

    act(() => {
      result.current.openScheduleCreate(2, '10:00');
    });

    await act(async () => {
      await result.current.handleScheduleSave({
        dayOfWeek: 2,
        startTime: '10:00',
        endTime: '11:00',
        groupId: 'group-2',
      });
    });

    expect(mockCreateMutate).toHaveBeenCalledWith({
      classroomId: 'classroom-1',
      dayOfWeek: 2,
      startTime: '10:00',
      endTime: '11:00',
      groupId: 'group-2',
    });
    expect(mockGetByClassroomQuery).toHaveBeenCalledTimes(2);
    expect(result.current.scheduleFormOpen).toBe(false);
    expect(result.current.scheduleError).toBe('');
  });

  it('translates schedule conflict errors using tRPC code', async () => {
    mockCreateMutate.mockRejectedValueOnce({
      data: { code: 'CONFLICT' },
      message: 'This time slot is already reserved',
    });

    const { result } = renderHook(() =>
      useClassroomSchedules({ selectedClassroomId: 'classroom-1' })
    );

    await waitFor(() => {
      expect(result.current.loadingSchedules).toBe(false);
    });

    act(() => {
      result.current.openScheduleCreate(2, '10:00');
    });

    await act(async () => {
      await result.current.handleScheduleSave({
        dayOfWeek: 2,
        startTime: '10:00',
        endTime: '11:00',
        groupId: 'group-2',
      });
    });

    expect(result.current.scheduleError).toBe('Ese tramo horario ya está reservado');
  });

  it('updates existing schedule when editing', async () => {
    const schedule = makeSchedule({ id: 'schedule-edit', dayOfWeek: 4, startTime: '12:00' });
    const { result } = renderHook(() =>
      useClassroomSchedules({ selectedClassroomId: 'classroom-1' })
    );

    await waitFor(() => {
      expect(result.current.loadingSchedules).toBe(false);
    });

    act(() => {
      result.current.openScheduleEdit(schedule);
    });

    await act(async () => {
      await result.current.handleScheduleSave({
        dayOfWeek: 4,
        startTime: '12:30',
        endTime: '13:30',
        groupId: 'group-3',
      });
    });

    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: 'schedule-edit',
      dayOfWeek: 4,
      startTime: '12:30',
      endTime: '13:30',
      groupId: 'group-3',
    });
  });

  it('surfaces delete errors and keeps delete target until closed', async () => {
    mockDeleteMutate.mockRejectedValueOnce(new Error('Delete failed'));
    const schedule = makeSchedule({ id: 'schedule-delete' });
    const { result } = renderHook(() =>
      useClassroomSchedules({ selectedClassroomId: 'classroom-1' })
    );

    await waitFor(() => {
      expect(result.current.loadingSchedules).toBe(false);
    });

    act(() => {
      result.current.requestScheduleDelete(schedule);
    });

    await act(async () => {
      await result.current.handleConfirmDeleteSchedule();
    });

    expect(result.current.scheduleDeleteTarget?.id).toBe('schedule-delete');
    expect(result.current.scheduleError).toBe('Delete failed');

    act(() => {
      result.current.closeScheduleDelete();
    });

    expect(result.current.scheduleDeleteTarget).toBeNull();
    expect(result.current.scheduleError).toBe('');
  });
});
