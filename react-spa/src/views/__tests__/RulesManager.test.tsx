import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RulesManager } from '../RulesManager';

// Mock the hooks and components
vi.mock('../../hooks/useRulesManager', () => ({
  useRulesManager: () => ({
    rules: [
      {
        id: '1',
        groupId: 'test-group',
        type: 'whitelist',
        value: 'google.com',
        comment: null,
        createdAt: '2024-01-15T10:00:00Z',
      },
    ],
    total: 1,
    loading: false,
    error: null,
    page: 1,
    setPage: vi.fn(),
    totalPages: 1,
    hasMore: false,
    filter: 'all',
    setFilter: vi.fn(),
    search: '',
    setSearch: vi.fn(),
    counts: { all: 1, allowed: 1, blocked: 0 },
    addRule: vi.fn().mockResolvedValue(true),
    deleteRule: vi.fn(),
    updateRule: vi.fn().mockResolvedValue(true),
    refetch: vi.fn(),
  }),
  FilterType: {},
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    ToastContainer: () => null,
  }),
}));

describe('RulesManager View', () => {
  const defaultProps = {
    groupId: 'test-group',
    groupName: 'Test Group',
    onBack: vi.fn(),
  };

  it('renders view with group name', () => {
    render(<RulesManager {...defaultProps} />);

    expect(screen.getByText('Gestión de Reglas')).toBeInTheDocument();
    expect(screen.getByText('Test Group')).toBeInTheDocument();
  });

  it('renders back button', () => {
    render(<RulesManager {...defaultProps} />);

    const backButton = screen.getByTitle('Volver a grupos');
    expect(backButton).toBeInTheDocument();
  });

  it('calls onBack when back button is clicked', () => {
    const handleBack = vi.fn();
    render(<RulesManager {...defaultProps} onBack={handleBack} />);

    fireEvent.click(screen.getByTitle('Volver a grupos'));
    expect(handleBack).toHaveBeenCalled();
  });

  it('renders search input', () => {
    render(<RulesManager {...defaultProps} />);

    expect(screen.getByPlaceholderText(/buscar en/i)).toBeInTheDocument();
  });

  it('renders add rule input and button', () => {
    render(<RulesManager {...defaultProps} />);

    expect(screen.getByPlaceholderText(/añadir dominio/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /añadir/i })).toBeInTheDocument();
  });

  it('renders filter tabs', () => {
    render(<RulesManager {...defaultProps} />);

    expect(screen.getByRole('tab', { name: /todos/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /permitidos/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /bloqueados/i })).toBeInTheDocument();
  });

  it('renders rules table with data', () => {
    render(<RulesManager {...defaultProps} />);

    expect(screen.getByText('google.com')).toBeInTheDocument();
  });
});
