import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Classrooms from '../Classrooms';

const mockClassroomsListQuery = vi.fn();
const mockClassroomsUpdateMutate = vi.fn();
const mockGroupsListQuery = vi.fn();
const mockSchedulesByClassroomQuery = vi.fn();

vi.mock('../../lib/trpc', () => ({
  trpc: {
    classrooms: {
      list: { query: (): unknown => mockClassroomsListQuery() },
      create: { mutate: vi.fn() },
      update: { mutate: (input: unknown): unknown => mockClassroomsUpdateMutate(input) },
      delete: { mutate: vi.fn() },
      setActiveGroup: { mutate: vi.fn() },
    },
    groups: {
      list: { query: (): unknown => mockGroupsListQuery() },
    },
    schedules: {
      getByClassroom: { query: (): unknown => mockSchedulesByClassroomQuery() },
      create: { mutate: vi.fn() },
      update: { mutate: vi.fn() },
      delete: { mutate: vi.fn() },
    },
  },
}));

vi.mock('../../components/WeeklyCalendar', () => ({
  default: () => <div data-testid="weekly-calendar" />,
}));

vi.mock('../../components/ScheduleFormModal', () => ({
  default: () => <div data-testid="schedule-form-modal" />,
}));

describe('Classrooms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClassroomsUpdateMutate.mockResolvedValue(undefined);

    mockGroupsListQuery.mockResolvedValue([
      { id: 'group-default', name: 'default', displayName: 'Grupo Default' },
      { id: 'group-calendar', name: 'calendar', displayName: 'Grupo Horario' },
    ]);

    mockSchedulesByClassroomQuery.mockResolvedValue({ schedules: [] });
  });

  it('shows current group as default when it matches default group', async () => {
    mockClassroomsListQuery.mockResolvedValue([
      {
        id: 'classroom-1',
        name: 'Aula 1',
        displayName: 'Aula 1',
        defaultGroupId: 'group-default',
        activeGroupId: null,
        currentGroupId: 'group-default',
        status: 'operational',
        machineCount: 0,
        onlineMachineCount: 0,
      },
    ]);

    render(<Classrooms />);

    await waitFor(() => {
      expect(screen.getByText(/por defecto/i, { selector: 'p' })).toBeInTheDocument();
    });
  });

  it('shows current group as calendar-assigned when it differs from default group', async () => {
    mockClassroomsListQuery.mockResolvedValue([
      {
        id: 'classroom-1',
        name: 'Aula 1',
        displayName: 'Aula 1',
        defaultGroupId: 'group-default',
        activeGroupId: null,
        currentGroupId: 'group-calendar',
        status: 'operational',
        machineCount: 0,
        onlineMachineCount: 0,
      },
    ]);

    render(<Classrooms />);

    await waitFor(() => {
      expect(screen.getByText(/por horario/i)).toBeInTheDocument();
    });
  });

  it('updates default group when user changes "Grupo por defecto" selector', async () => {
    mockClassroomsListQuery.mockResolvedValue([
      {
        id: 'classroom-1',
        name: 'Aula 1',
        displayName: 'Aula 1',
        defaultGroupId: 'group-default',
        activeGroupId: null,
        currentGroupId: 'group-default',
        status: 'operational',
        machineCount: 0,
        onlineMachineCount: 0,
      },
    ]);

    render(<Classrooms />);

    const defaultGroupSelect = await screen.findByLabelText(/grupo por defecto/i);
    fireEvent.change(defaultGroupSelect, { target: { value: 'group-calendar' } });

    await waitFor(() => {
      expect(mockClassroomsUpdateMutate).toHaveBeenCalledWith({
        id: 'classroom-1',
        defaultGroupId: 'group-calendar',
      });
    });
  });
});
