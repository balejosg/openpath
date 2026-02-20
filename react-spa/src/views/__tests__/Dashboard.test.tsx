import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Dashboard from '../Dashboard';

// Mock trpc
const mockStatsQuery = vi.fn();
const mockRequestsStatsQuery = vi.fn();
const mockSystemStatusQuery = vi.fn();
const mockGroupsListQuery = vi.fn();
const mockClassroomsListQuery = vi.fn();

vi.mock('../../lib/trpc', () => ({
  trpc: {
    groups: {
      stats: { query: (): unknown => mockStatsQuery() },
      list: { query: (): unknown => mockGroupsListQuery() },
      systemStatus: { query: (): unknown => mockSystemStatusQuery() },
    },
    classrooms: {
      list: { query: (): unknown => mockClassroomsListQuery() },
    },
    requests: {
      stats: { query: (): unknown => mockRequestsStatsQuery() },
    },
  },
}));

describe('Dashboard', () => {
  const mockGroups = [
    {
      id: 'group-1',
      name: 'primaria',
      displayName: 'Grupo Primaria',
      enabled: true,
      whitelistCount: 45,
      blockedSubdomainCount: 5,
      blockedPathCount: 3,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-20T10:00:00Z',
    },
    {
      id: 'group-2',
      name: 'secundaria',
      displayName: 'Grupo Secundaria',
      enabled: true,
      whitelistCount: 32,
      blockedSubdomainCount: 2,
      blockedPathCount: 1,
      createdAt: '2024-01-10T10:00:00Z',
      updatedAt: '2024-01-18T10:00:00Z',
    },
    {
      id: 'group-3',
      name: 'profesores',
      displayName: 'Profesores',
      enabled: false,
      whitelistCount: 12,
      blockedSubdomainCount: 0,
      blockedPathCount: 0,
      createdAt: '2024-01-05T10:00:00Z',
      updatedAt: '2024-01-05T10:00:00Z',
    },
  ];

  const mockStats = {
    groupCount: 3,
    whitelistCount: 89,
    blockedCount: 11,
  };

  const mockRequestStats = {
    pending: 5,
  };

  const mockSystemStatus = {
    enabled: true,
  };

  const mockClassrooms = [
    {
      id: 'classroom-1',
      name: 'Laboratorio A',
      displayName: 'Laboratorio A',
      defaultGroupId: 'group-1',
      activeGroupId: null,
      currentGroupId: 'group-1',
    },
    {
      id: 'classroom-2',
      name: 'Aula 2',
      displayName: 'Aula 2',
      defaultGroupId: null,
      activeGroupId: null,
      currentGroupId: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockStatsQuery.mockResolvedValue(mockStats);
    mockRequestsStatsQuery.mockResolvedValue(mockRequestStats);
    mockSystemStatusQuery.mockResolvedValue(mockSystemStatus);
    mockGroupsListQuery.mockResolvedValue(mockGroups);
    mockClassroomsListQuery.mockResolvedValue(mockClassrooms);
  });

  it('renders stats cards', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Grupos Activos')).toBeInTheDocument();
      expect(screen.getByText('Dominios Permitidos')).toBeInTheDocument();
      expect(screen.getByText('Sitios Bloqueados')).toBeInTheDocument();
      expect(screen.getByText('Solicitudes Pendientes')).toBeInTheDocument();
    });
  });

  it('renders system status banner', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Estado del Sistema: Seguro')).toBeInTheDocument();
    });
  });

  it('shows disabled system status when not enabled', async () => {
    mockSystemStatusQuery.mockResolvedValue({ enabled: false });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Estado del Sistema: Sin grupos activos')).toBeInTheDocument();
    });
  });

  it('renders active groups by classroom in the banner', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Grupo vigente por aula')).toBeInTheDocument();
      expect(screen.getByText('Laboratorio A')).toBeInTheDocument();
      expect(screen.getByText(/Grupo Primaria/)).toBeInTheDocument();
    });
  });

  it('renders quick access section when onNavigateToRules is provided', async () => {
    const onNavigateToRules = vi.fn();

    render(<Dashboard onNavigateToRules={onNavigateToRules} />);

    await waitFor(() => {
      expect(screen.getByText('Acceso Rápido')).toBeInTheDocument();
    });
  });

  it('does not render quick access section when onNavigateToRules is not provided', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Grupos Activos')).toBeInTheDocument();
    });

    expect(screen.queryByText('Acceso Rápido')).not.toBeInTheDocument();
  });

  it('renders group cards in quick access section', async () => {
    const onNavigateToRules = vi.fn();

    render(<Dashboard onNavigateToRules={onNavigateToRules} />);

    await waitFor(() => {
      expect(screen.getByText('Grupo Primaria')).toBeInTheDocument();
      expect(screen.getByText('Grupo Secundaria')).toBeInTheDocument();
      expect(screen.getByText('Profesores')).toBeInTheDocument();
    });
  });

  it('shows allowed and blocked counts for each group', async () => {
    const onNavigateToRules = vi.fn();

    render(<Dashboard onNavigateToRules={onNavigateToRules} />);

    await waitFor(() => {
      // Group 1: 45 allowed, 8 blocked (5+3)
      expect(screen.getByText('45')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
    });
  });

  it('calls onNavigateToRules when manage button is clicked', async () => {
    const onNavigateToRules = vi.fn();

    render(<Dashboard onNavigateToRules={onNavigateToRules} />);

    await waitFor(() => {
      expect(screen.getByTestId('manage-rules-group-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('manage-rules-group-1'));

    expect(onNavigateToRules).toHaveBeenCalledWith({
      id: 'group-1',
      name: 'Grupo Primaria',
    });
  });

  it('shows inactive groups with opacity styling', async () => {
    const onNavigateToRules = vi.fn();

    render(<Dashboard onNavigateToRules={onNavigateToRules} />);

    await waitFor(() => {
      const inactiveCard = screen.getByTestId('group-card-group-3');
      expect(inactiveCard).toHaveClass('opacity-60');
    });
  });

  it('shows active groups without opacity styling', async () => {
    const onNavigateToRules = vi.fn();

    render(<Dashboard onNavigateToRules={onNavigateToRules} />);

    await waitFor(() => {
      const activeCard = screen.getByTestId('group-card-group-1');
      expect(activeCard).not.toHaveClass('opacity-60');
    });
  });

  it('shows Activo badge for enabled groups', async () => {
    const onNavigateToRules = vi.fn();

    render(<Dashboard onNavigateToRules={onNavigateToRules} />);

    await waitFor(() => {
      const activeBadges = screen.getAllByText('Activo');
      expect(activeBadges.length).toBe(2);
    });
  });

  it('shows Inactivo badge for disabled groups', async () => {
    const onNavigateToRules = vi.fn();

    render(<Dashboard onNavigateToRules={onNavigateToRules} />);

    await waitFor(() => {
      expect(screen.getByText('Inactivo')).toBeInTheDocument();
    });
  });

  it('limits displayed groups to 6 maximum', async () => {
    const manyGroups = Array.from({ length: 10 }, (_, i) => ({
      id: `group-${String(i)}`,
      name: `group-${String(i)}`,
      displayName: `Group ${String(i)}`,
      enabled: true,
      whitelistCount: 10,
      blockedSubdomainCount: 2,
      blockedPathCount: 1,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
    }));

    mockGroupsListQuery.mockResolvedValue(manyGroups);

    const onNavigateToRules = vi.fn();

    render(<Dashboard onNavigateToRules={onNavigateToRules} />);

    await waitFor(() => {
      const grid = screen.getByTestId('quick-access-grid');
      // Should only show 6 cards
      expect(grid.children.length).toBe(6);
    });
  });

  it('shows "view all" message when there are more than 6 groups', async () => {
    const manyGroups = Array.from({ length: 10 }, (_, i) => ({
      id: `group-${String(i)}`,
      name: `group-${String(i)}`,
      displayName: `Group ${String(i)}`,
      enabled: true,
      whitelistCount: 10,
      blockedSubdomainCount: 2,
      blockedPathCount: 1,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
    }));

    mockGroupsListQuery.mockResolvedValue(manyGroups);

    const onNavigateToRules = vi.fn();

    render(<Dashboard onNavigateToRules={onNavigateToRules} />);

    await waitFor(() => {
      expect(screen.getByText(/Mostrando 6 de 10 grupos/)).toBeInTheDocument();
    });
  });

  it('does not show "view all" message when there are 6 or fewer groups', async () => {
    const onNavigateToRules = vi.fn();

    render(<Dashboard onNavigateToRules={onNavigateToRules} />);

    await waitFor(() => {
      expect(screen.getByText('Grupo Primaria')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
  });

  it('shows empty state when no groups exist', async () => {
    mockGroupsListQuery.mockResolvedValue([]);

    const onNavigateToRules = vi.fn();

    render(<Dashboard onNavigateToRules={onNavigateToRules} />);

    await waitFor(() => {
      expect(screen.getByText('No hay grupos configurados.')).toBeInTheDocument();
    });
  });

  it('shows loading state for groups', () => {
    // Never resolve the promise
    mockGroupsListQuery.mockImplementation(
      () =>
        new Promise<never>(() => {
          /* intentionally empty */
        })
    );

    const onNavigateToRules = vi.fn();

    render(<Dashboard onNavigateToRules={onNavigateToRules} />);

    expect(screen.getByText('Cargando grupos...')).toBeInTheDocument();
  });

  it('refreshes pending requests count when the window regains focus', async () => {
    mockRequestsStatsQuery
      .mockResolvedValueOnce({ pending: 5 })
      .mockResolvedValueOnce({ pending: 7 });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    fireEvent(window, new Event('focus'));

    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument();
    });
  });

  it('shows error state when groups fail to load', async () => {
    mockGroupsListQuery.mockRejectedValue(new Error('Network error'));

    const onNavigateToRules = vi.fn();

    render(<Dashboard onNavigateToRules={onNavigateToRules} />);

    await waitFor(() => {
      expect(screen.getByText('Error al cargar grupos')).toBeInTheDocument();
    });
  });

  describe('Sort functionality', () => {
    it('renders sort dropdown button', async () => {
      const onNavigateToRules = vi.fn();

      render(<Dashboard onNavigateToRules={onNavigateToRules} />);

      await waitFor(() => {
        expect(screen.getByTestId('sort-dropdown-button')).toBeInTheDocument();
      });
    });

    it('shows sort options when dropdown is clicked', async () => {
      const onNavigateToRules = vi.fn();

      render(<Dashboard onNavigateToRules={onNavigateToRules} />);

      await waitFor(() => {
        expect(screen.getByTestId('sort-dropdown-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('sort-dropdown-button'));

      expect(screen.getByTestId('sort-dropdown-menu')).toBeInTheDocument();
      expect(screen.getByTestId('sort-option-name')).toBeInTheDocument();
      expect(screen.getByTestId('sort-option-rules')).toBeInTheDocument();
      expect(screen.getByTestId('sort-option-recent')).toBeInTheDocument();
    });

    it('sorts by name (A-Z) by default', async () => {
      const onNavigateToRules = vi.fn();

      render(<Dashboard onNavigateToRules={onNavigateToRules} />);

      await waitFor(() => {
        expect(screen.getByText(/Nombre \(A-Z\)/)).toBeInTheDocument();
      });
    });

    it('changes sort order when option is selected', async () => {
      const onNavigateToRules = vi.fn();

      render(<Dashboard onNavigateToRules={onNavigateToRules} />);

      await waitFor(() => {
        expect(screen.getByTestId('sort-dropdown-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('sort-dropdown-button'));
      fireEvent.click(screen.getByTestId('sort-option-rules'));

      await waitFor(() => {
        expect(screen.getByText(/Más reglas/)).toBeInTheDocument();
      });
    });

    it('sorts by rules count descending when "Más reglas" is selected', async () => {
      const onNavigateToRules = vi.fn();

      render(<Dashboard onNavigateToRules={onNavigateToRules} />);

      await waitFor(() => {
        expect(screen.getByTestId('sort-dropdown-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('sort-dropdown-button'));
      fireEvent.click(screen.getByTestId('sort-option-rules'));

      await waitFor(() => {
        const grid = screen.getByTestId('quick-access-grid');
        const firstCard = grid.children[0];
        // Group Primaria has most rules (45+5+3=53)
        expect(firstCard).toHaveAttribute('data-testid', 'group-card-group-1');
      });
    });
  });
});
