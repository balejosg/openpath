import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GroupLabel, resolveGroupDisplayName } from '../GroupLabel';

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
