import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  GroupLabel,
  resolveClassroomGroupSelectState,
  resolveGroupDisplayName,
} from '../GroupLabel';

describe('GroupLabel', () => {
  it('renders a known group displayName', () => {
    render(
      <GroupLabel
        groupId="g1"
        group={{ id: 'g1', name: 'n1', displayName: 'Grupo Uno', enabled: true }}
        source="default"
      />
    );

    expect(screen.getByText('Grupo Uno · defecto')).toBeInTheDocument();
  });

  it('redacts unknown group ids for non-admin users based on source', () => {
    render(<GroupLabel groupId="secret" source="schedule" />);
    expect(screen.getByText('Reservado por otro profesor · horario')).toBeInTheDocument();
  });

  it('reveals unknown group id when requested', () => {
    render(<GroupLabel groupId="secret" source="schedule" revealUnknownId />);
    expect(screen.getByText('secret · horario')).toBeInTheDocument();
  });
});

describe('resolveGroupDisplayName', () => {
  it('uses noneLabel when groupId is empty', () => {
    const name = resolveGroupDisplayName({ groupId: '', source: 'none', noneLabel: 'Sin grupo' });
    expect(name).toBe('Sin grupo');
  });
});

describe('resolveClassroomGroupSelectState', () => {
  it('returns empty values for no classroom selection', () => {
    const state = resolveClassroomGroupSelectState({ classroom: null, admin: false });

    expect(state).toEqual({
      source: 'none',
      activeGroupValue: '',
      defaultGroupValue: '',
    });
  });

  it('keeps active selector consistent for hidden manual group in non-admin view', () => {
    const state = resolveClassroomGroupSelectState({
      classroom: {
        activeGroup: null,
        currentGroupId: 'group-hidden',
        currentGroupSource: 'manual',
        defaultGroupId: 'group-default',
      },
      admin: false,
    });

    expect(state.source).toBe('manual');
    expect(state.activeGroupValue).toBe('group-hidden');
    expect(state.defaultGroupValue).toBe('group-default');
  });

  it('keeps default selector consistent for hidden default group in non-admin view', () => {
    const state = resolveClassroomGroupSelectState({
      classroom: {
        activeGroup: null,
        currentGroupId: 'group-hidden-default',
        currentGroupSource: 'default',
        defaultGroupId: null,
      },
      admin: false,
    });

    expect(state.source).toBe('default');
    expect(state.activeGroupValue).toBe('');
    expect(state.defaultGroupValue).toBe('group-hidden-default');
  });

  it('does not backfill hidden values for admins', () => {
    const state = resolveClassroomGroupSelectState({
      classroom: {
        activeGroup: null,
        currentGroupId: 'group-hidden-default',
        currentGroupSource: 'default',
        defaultGroupId: null,
      },
      admin: true,
    });

    expect(state.source).toBe('default');
    expect(state.activeGroupValue).toBe('');
    expect(state.defaultGroupValue).toBe('');
  });
});
