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

  const noop = vi.fn();

  it('renders loading state', () => {
    render(<RulesTable rules={[]} loading={true} onDelete={noop} />);
    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
  });

  it('renders empty state when no rules', () => {
    render(<RulesTable rules={[]} loading={false} onDelete={noop} />);
    expect(screen.getByText(/no hay reglas configuradas/i)).toBeInTheDocument();
  });

  it('renders custom empty message', () => {
    render(
      <RulesTable rules={[]} loading={false} onDelete={noop} emptyMessage="Custom empty message" />
    );
    expect(screen.getByText('Custom empty message')).toBeInTheDocument();
  });

  it('renders rules in table', () => {
    render(<RulesTable rules={mockRules} loading={false} onDelete={noop} />);

    expect(screen.getByText('google.com')).toBeInTheDocument();
    expect(screen.getByText('ads.example.com')).toBeInTheDocument();
  });

  it('displays rule type badges', () => {
    render(<RulesTable rules={mockRules} loading={false} onDelete={noop} />);

    expect(screen.getByText('Permitido')).toBeInTheDocument();
    expect(screen.getByText('Sub. bloq.')).toBeInTheDocument();
  });

  it('displays comments when present', () => {
    render(<RulesTable rules={mockRules} loading={false} onDelete={noop} />);

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
    render(<RulesTable rules={mockRules} loading={false} onDelete={noop} onEdit={handleEdit} />);

    const editButtons = screen.getAllByTitle('Editar');
    expect(editButtons).toHaveLength(2);

    fireEvent.click(editButtons[0]);
    expect(handleEdit).toHaveBeenCalledWith(mockRules[0]);
  });

  it('does not show edit button when onEdit is not provided', () => {
    render(<RulesTable rules={mockRules} loading={false} onDelete={noop} />);

    expect(screen.queryByTitle('Editar')).not.toBeInTheDocument();
  });

  describe('Selection functionality', () => {
    it('renders checkboxes when selection props are provided', () => {
      const selectedIds = new Set<string>();
      render(
        <RulesTable
          rules={mockRules}
          loading={false}
          onDelete={noop}
          selectedIds={selectedIds}
          onToggleSelection={noop}
          onToggleSelectAll={noop}
          isAllSelected={false}
          hasSelection={false}
        />
      );

      // Should have select all button + 2 row checkboxes
      const selectButtons = screen.getAllByTitle(/seleccionar/i);
      expect(selectButtons.length).toBeGreaterThanOrEqual(2);
    });

    it('calls onToggleSelection when row checkbox is clicked', () => {
      const selectedIds = new Set<string>();
      const handleToggleSelection = vi.fn();
      render(
        <RulesTable
          rules={mockRules}
          loading={false}
          onDelete={noop}
          selectedIds={selectedIds}
          onToggleSelection={handleToggleSelection}
          onToggleSelectAll={noop}
          isAllSelected={false}
          hasSelection={false}
        />
      );

      const selectButtons = screen.getAllByTitle('Seleccionar');
      fireEvent.click(selectButtons[0]);

      expect(handleToggleSelection).toHaveBeenCalledWith('1');
    });

    it('calls onToggleSelectAll when header checkbox is clicked', () => {
      const selectedIds = new Set<string>();
      const handleToggleSelectAll = vi.fn();
      render(
        <RulesTable
          rules={mockRules}
          loading={false}
          onDelete={noop}
          selectedIds={selectedIds}
          onToggleSelection={noop}
          onToggleSelectAll={handleToggleSelectAll}
          isAllSelected={false}
          hasSelection={false}
        />
      );

      const selectAllButton = screen.getByTitle('Seleccionar todo');
      fireEvent.click(selectAllButton);

      expect(handleToggleSelectAll).toHaveBeenCalled();
    });

    it('highlights selected rows', () => {
      const selectedIds = new Set(['1']);
      render(
        <RulesTable
          rules={mockRules}
          loading={false}
          onDelete={noop}
          selectedIds={selectedIds}
          onToggleSelection={noop}
          onToggleSelectAll={noop}
          isAllSelected={false}
          hasSelection={true}
        />
      );

      // Check that Deseleccionar button appears for selected row
      expect(screen.getByTitle('Deseleccionar')).toBeInTheDocument();
    });

    it('does not render checkboxes when selection props are not provided', () => {
      render(<RulesTable rules={mockRules} loading={false} onDelete={noop} />);

      expect(screen.queryByTitle('Seleccionar todo')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Seleccionar')).not.toBeInTheDocument();
    });
  });
});
