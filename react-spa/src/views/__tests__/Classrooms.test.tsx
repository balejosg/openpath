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

  it('shows actionable feedback when clearing default group fails with 4xx', async () => {
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
    mockClassroomsUpdateMutate.mockRejectedValueOnce(
      new Error('BAD_REQUEST: default group required')
    );

    render(<Classrooms />);

    const defaultGroupSelect = await screen.findByLabelText(/grupo por defecto/i);
    fireEvent.change(defaultGroupSelect, { target: { value: '' } });

    expect(
      await screen.findByText(
        'No puedes dejar el aula sin grupo por defecto mientras no exista un grupo activo válido.'
      )
    ).toBeInTheDocument();
  });

  it('keeps classroom search usable with extra spaces and uppercase input', async () => {
    mockClassroomsListQuery.mockResolvedValue([
      {
        id: 'classroom-1',
        name: 'Laboratorio Norte',
        displayName: 'Laboratorio Norte',
        defaultGroupId: null,
        activeGroupId: null,
        currentGroupId: null,
        status: 'operational',
        machineCount: 0,
        onlineMachineCount: 0,
      },
    ]);

    render(<Classrooms />);

    expect((await screen.findAllByText('Laboratorio Norte')).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText('Buscar aula...'), {
      target: { value: '   LABORATORIO   NORTE  ' },
    });

    await waitFor(() => {
      expect(screen.getAllByText('Laboratorio Norte').length).toBeGreaterThan(0);
      expect(screen.queryByText('No se encontraron aulas')).not.toBeInTheDocument();
    });
  });

  it('clears detail panel when filters leave the list empty', async () => {
    mockClassroomsListQuery.mockResolvedValue([
      {
        id: 'classroom-1',
        name: 'Laboratorio Norte',
        displayName: 'Laboratorio Norte',
        defaultGroupId: null,
        activeGroupId: null,
        currentGroupId: null,
        status: 'operational',
        machineCount: 0,
        onlineMachineCount: 0,
      },
    ]);

    render(<Classrooms />);

    await screen.findByText('Configuración y estado del aula');

    fireEvent.change(screen.getByPlaceholderText('Buscar aula...'), {
      target: { value: 'no-match-value' },
    });

    expect(screen.getByText('No se encontraron aulas')).toBeInTheDocument();
    expect(screen.queryByText('Configuración y estado del aula')).not.toBeInTheDocument();
    expect(screen.getByText('Sin aulas')).toBeInTheDocument();
  });
});
