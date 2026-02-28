import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScheduleFormModal from '../ScheduleFormModal';
import type { ScheduleWithPermissions } from '../../types';

describe('ScheduleFormModal Component', () => {
  const groups = [
    { id: 'g1', displayName: 'Grupo 1' },
    { id: 'g2', displayName: 'Grupo 2' },
  ];

  it('renders create mode by default and calls onClose', () => {
    const onClose = vi.fn();
    render(
      <ScheduleFormModal
        schedule={null}
        groups={groups}
        saving={false}
        error=""
        onSave={vi.fn()}
        onClose={onClose}
      />
    );

    expect(screen.getByText('Nuevo Horario')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('prefills day and start time when provided, and calls onSave with data', () => {
    const onSave = vi.fn();
    render(
      <ScheduleFormModal
        schedule={null}
        defaultDay={3}
        defaultStartTime="10:00"
        groups={groups}
        saving={false}
        error=""
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    // Day buttons show first 3 letters
    const dayBtn = screen.getByRole('button', { name: 'Mié' });
    expect(dayBtn).toBeInTheDocument();

    // Change end time to ensure > start
    fireEvent.change(screen.getByLabelText('Hora Fin'), { target: { value: '11:00' } });
    fireEvent.click(screen.getByRole('button', { name: /crear horario/i }));

    expect(onSave).toHaveBeenCalled();
    const saved = onSave.mock.calls[0]?.[0] as {
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      groupId: string;
    };
    expect(saved.dayOfWeek).toBe(3);
    expect(saved.startTime).toBe('10:00');
    expect(saved.endTime).toBe('11:00');
    expect(saved.groupId).toBe('g1');
  });

  it('requires selecting a day when creating without a default day', () => {
    const onSave = vi.fn();
    render(
      <ScheduleFormModal
        schedule={null}
        groups={groups}
        saving={false}
        error=""
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /crear horario/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Selecciona un dia')).toBeInTheDocument();
  });

  it('accepts numeric dayOfWeek even if returned as a string', () => {
    const onSave = vi.fn();
    const schedule = {
      id: 's1',
      classroomId: 'c1',
      dayOfWeek: '2',
      startTime: '08:00',
      endTime: '09:00',
      groupId: 'g2',
      teacherId: 't1',
      recurrence: 'weekly',
      createdAt: new Date().toISOString(),
      updatedAt: undefined,
      isMine: true,
      canEdit: true,
    } as unknown as ScheduleWithPermissions;

    render(
      <ScheduleFormModal
        schedule={schedule}
        groups={groups}
        saving={false}
        error=""
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(onSave).toHaveBeenCalled();
    const saved = onSave.mock.calls[0]?.[0] as { dayOfWeek: number };
    expect(saved.dayOfWeek).toBe(2);
  });

  it('renders edit mode when schedule is provided', () => {
    const schedule: ScheduleWithPermissions = {
      id: 's1',
      classroomId: 'c1',
      dayOfWeek: 2,
      startTime: '08:00',
      endTime: '09:00',
      groupId: 'g2',
      teacherId: 't1',
      recurrence: 'weekly',
      createdAt: new Date().toISOString(),
      updatedAt: undefined,
      isMine: true,
      canEdit: true,
    };

    render(
      <ScheduleFormModal
        schedule={schedule}
        groups={groups}
        saving={false}
        error=""
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Editar Horario')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument();
  });
});
