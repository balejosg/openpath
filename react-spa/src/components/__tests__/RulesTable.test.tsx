import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RulesTable, Rule } from '../RulesTable';

describe('RulesTable Component', () => {
  const mockRules: Rule[] = [
    {
      id: '1',
      groupId: 'group-1',
      type: 'whitelist',
      value: 'google.com',
      comment: 'Search engine',
      createdAt: '2024-01-15T10:00:00Z',
    },
    {
      id: '2',
      groupId: 'group-1',
      type: 'blocked_subdomain',
      value: 'ads.example.com',
      comment: null,
      createdAt: '2024-01-16T10:00:00Z',
    },
  ];

  it('renders loading state', () => {
    render(<RulesTable rules={[]} loading={true} onDelete={() => {}} />);
    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
  });

  it('renders empty state when no rules', () => {
    render(<RulesTable rules={[]} loading={false} onDelete={() => {}} />);
    expect(screen.getByText(/no hay reglas configuradas/i)).toBeInTheDocument();
  });

  it('renders custom empty message', () => {
    render(
      <RulesTable
        rules={[]}
        loading={false}
        onDelete={() => {}}
        emptyMessage="Custom empty message"
      />
    );
    expect(screen.getByText('Custom empty message')).toBeInTheDocument();
  });

  it('renders rules in table', () => {
    render(<RulesTable rules={mockRules} loading={false} onDelete={() => {}} />);

    expect(screen.getByText('google.com')).toBeInTheDocument();
    expect(screen.getByText('ads.example.com')).toBeInTheDocument();
  });

  it('displays rule type badges', () => {
    render(<RulesTable rules={mockRules} loading={false} onDelete={() => {}} />);

    expect(screen.getByText('Permitido')).toBeInTheDocument();
    expect(screen.getByText('Sub. bloq.')).toBeInTheDocument();
  });

  it('displays comments when present', () => {
    render(<RulesTable rules={mockRules} loading={false} onDelete={() => {}} />);

    expect(screen.getByText('Search engine')).toBeInTheDocument();
  });

  it('calls onDelete when delete button is clicked', () => {
    const handleDelete = vi.fn();
    render(<RulesTable rules={mockRules} loading={false} onDelete={handleDelete} />);

    const deleteButtons = screen.getAllByTitle('Eliminar');
    fireEvent.click(deleteButtons[0]);

    expect(handleDelete).toHaveBeenCalledWith(mockRules[0]);
  });

  it('shows edit button when onEdit is provided', () => {
    const handleEdit = vi.fn();
    render(
      <RulesTable rules={mockRules} loading={false} onDelete={() => {}} onEdit={handleEdit} />
    );

    const editButtons = screen.getAllByTitle('Editar');
    expect(editButtons).toHaveLength(2);

    fireEvent.click(editButtons[0]);
    expect(handleEdit).toHaveBeenCalledWith(mockRules[0]);
  });

  it('does not show edit button when onEdit is not provided', () => {
    render(<RulesTable rules={mockRules} loading={false} onDelete={() => {}} />);

    expect(screen.queryByTitle('Editar')).not.toBeInTheDocument();
  });
});
