import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DomainManagementModal } from '../DomainManagementModal';

// Mock trpc
vi.mock('../../lib/trpc', () => ({
  trpc: {
    groups: {
      listRules: {
        query: vi.fn(),
      },
      createRule: {
        mutate: vi.fn(),
      },
      deleteRule: {
        mutate: vi.fn(),
      },
      bulkCreateRules: {
        mutate: vi.fn(),
      },
    },
  },
}));

import { trpc } from '../../lib/trpc';

const mockListRules = trpc.groups.listRules.query as ReturnType<typeof vi.fn>;
const mockCreateRule = trpc.groups.createRule.mutate as ReturnType<typeof vi.fn>;
const mockDeleteRule = trpc.groups.deleteRule.mutate as ReturnType<typeof vi.fn>;

describe('DomainManagementModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    groupId: 'group-1',
    groupName: 'test-group',
    onDomainsChanged: vi.fn(),
    onToast: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';

    // Default mock implementations - return empty arrays for all rule types
    mockListRules.mockResolvedValue([]);
  });

  describe('Basic Rendering', () => {
    it('renders modal with group name in title', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Gestionar Reglas: test-group/)).toBeInTheDocument();
      });
    });

    it('does not render when isOpen is false', () => {
      render(<DomainManagementModal {...defaultProps} isOpen={false} />);
      expect(screen.queryByText(/Gestionar Reglas/)).not.toBeInTheDocument();
    });

    it('shows loading state initially', () => {
      mockListRules.mockReturnValue(
        new Promise<never>(() => {
          // Intentionally never resolves
        })
      );

      render(<DomainManagementModal {...defaultProps} />);

      expect(screen.getByText('Cargando...')).toBeInTheDocument();
    });
  });

  describe('Filter Chips', () => {
    it('renders all three filter chips', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Todos')).toBeInTheDocument();
        expect(screen.getByText('Permitidos')).toBeInTheDocument();
        expect(screen.getByText('Bloqueados')).toBeInTheDocument();
      });
    });

    it('shows correct counts in filter chips', async () => {
      mockListRules
        .mockResolvedValueOnce([
          {
            id: '1',
            groupId: 'group-1',
            type: 'whitelist',
            value: 'google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
          {
            id: '2',
            groupId: 'group-1',
            type: 'whitelist',
            value: 'youtube.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: '3',
            groupId: 'group-1',
            type: 'blocked_subdomain',
            value: 'ads.google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([]);

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument(); // Total count
        expect(screen.getByText('2')).toBeInTheDocument(); // Allowed count
        expect(screen.getByText('1')).toBeInTheDocument(); // Blocked count
      });
    });

    it('filters by Permitidos when clicked', async () => {
      mockListRules
        .mockResolvedValueOnce([
          {
            id: '1',
            groupId: 'group-1',
            type: 'whitelist',
            value: 'google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: '2',
            groupId: 'group-1',
            type: 'blocked_subdomain',
            value: 'ads.google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([]);

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('google.com')).toBeInTheDocument();
        expect(screen.getByText('ads.google.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Permitidos'));

      await waitFor(() => {
        expect(screen.getByText('google.com')).toBeInTheDocument();
        expect(screen.queryByText('ads.google.com')).not.toBeInTheDocument();
      });
    });

    it('filters by Bloqueados when clicked', async () => {
      mockListRules
        .mockResolvedValueOnce([
          {
            id: '1',
            groupId: 'group-1',
            type: 'whitelist',
            value: 'google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: '2',
            groupId: 'group-1',
            type: 'blocked_subdomain',
            value: 'ads.google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([]);

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('google.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Bloqueados'));

      await waitFor(() => {
        expect(screen.queryByText('google.com')).not.toBeInTheDocument();
        expect(screen.getByText('ads.google.com')).toBeInTheDocument();
      });
    });
  });

  describe('Unified Rules List', () => {
    it('displays empty state when no rules', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No hay reglas configuradas')).toBeInTheDocument();
      });
    });

    it('displays all rules in a single list', async () => {
      mockListRules
        .mockResolvedValueOnce([
          {
            id: '1',
            groupId: 'group-1',
            type: 'whitelist',
            value: 'google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: '2',
            groupId: 'group-1',
            type: 'blocked_subdomain',
            value: 'ads.google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: '3',
            groupId: 'group-1',
            type: 'blocked_path',
            value: 'facebook.com/gaming',
            comment: null,
            createdAt: '2024-01-01',
          },
        ]);

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('google.com')).toBeInTheDocument();
        expect(screen.getByText('ads.google.com')).toBeInTheDocument();
        expect(screen.getByText('facebook.com/gaming')).toBeInTheDocument();
      });
    });

    it('shows type badges for each rule', async () => {
      mockListRules
        .mockResolvedValueOnce([
          {
            id: '1',
            groupId: 'group-1',
            type: 'whitelist',
            value: 'google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: '2',
            groupId: 'group-1',
            type: 'blocked_subdomain',
            value: 'ads.google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([]);

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Permitido')).toBeInTheDocument();
        expect(screen.getByText('Sub. bloq.')).toBeInTheDocument();
      });
    });

    it('filters rules by search', async () => {
      mockListRules
        .mockResolvedValueOnce([
          {
            id: '1',
            groupId: 'group-1',
            type: 'whitelist',
            value: 'google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
          {
            id: '2',
            groupId: 'group-1',
            type: 'whitelist',
            value: 'youtube.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('google.com')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Buscar en/);
      fireEvent.change(searchInput, { target: { value: 'google' } });

      expect(screen.getByText('google.com')).toBeInTheDocument();
      expect(screen.queryByText('youtube.com')).not.toBeInTheDocument();
    });
  });

  describe('Auto-Detection (Omnibar)', () => {
    it('detects domain and shows hint', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir regla/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir regla/);
      fireEvent.change(input, { target: { value: 'example.com' } });

      await waitFor(() => {
        expect(screen.getByText(/Se añadirá como:/)).toBeInTheDocument();
        expect(screen.getByText('Permitido')).toBeInTheDocument();
      });
    });

    it('detects path and shows hint', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir regla/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir regla/);
      fireEvent.change(input, { target: { value: 'facebook.com/gaming' } });

      await waitFor(() => {
        expect(screen.getByText(/Se añadirá como:/)).toBeInTheDocument();
        expect(screen.getByText('Ruta bloq.')).toBeInTheDocument();
      });
    });

    it('detects subdomain when root is whitelisted', async () => {
      mockListRules
        .mockResolvedValueOnce([
          {
            id: '1',
            groupId: 'group-1',
            type: 'whitelist',
            value: 'google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('google.com')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir regla/);
      fireEvent.change(input, { target: { value: 'ads.google.com' } });

      await waitFor(() => {
        expect(screen.getByText(/Se añadirá como:/)).toBeInTheDocument();
        expect(screen.getByText('Sub. bloq.')).toBeInTheDocument();
      });
    });

    it('adds rule with auto-detected type', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir regla/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir regla/);
      fireEvent.change(input, { target: { value: 'example.com' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(mockCreateRule).toHaveBeenCalledWith({
          groupId: 'group-1',
          type: 'whitelist',
          value: 'example.com',
        });
      });
    });

    it('adds path rule with auto-detected type', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir regla/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir regla/);
      fireEvent.change(input, { target: { value: 'facebook.com/gaming' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(mockCreateRule).toHaveBeenCalledWith({
          groupId: 'group-1',
          type: 'blocked_path',
          value: 'facebook.com/gaming',
        });
      });
    });

    it('adds rule on Enter key', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir regla/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir regla/);
      fireEvent.change(input, { target: { value: 'example.com' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockCreateRule).toHaveBeenCalled();
      });
    });
  });

  describe('Validation', () => {
    it('shows error for invalid domain format', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir regla/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir regla/);
      fireEvent.change(input, { target: { value: 'invalid' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(screen.getByText(/no es un formato válido/)).toBeInTheDocument();
      });
    });

    it('shows error for duplicate rule', async () => {
      mockListRules
        .mockResolvedValueOnce([
          {
            id: '1',
            groupId: 'group-1',
            type: 'whitelist',
            value: 'google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('google.com')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir regla/);
      fireEvent.change(input, { target: { value: 'google.com' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(screen.getByText(/ya existe/)).toBeInTheDocument();
      });
    });

    it('strips protocol from pasted URLs', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir regla/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir regla/);
      fireEvent.change(input, { target: { value: 'https://example.com' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(mockCreateRule).toHaveBeenCalledWith({
          groupId: 'group-1',
          type: 'whitelist',
          value: 'example.com',
        });
      });
    });
  });

  describe('Delete Rules', () => {
    it('deletes a rule', async () => {
      mockListRules
        .mockResolvedValueOnce([
          {
            id: '1',
            groupId: 'group-1',
            type: 'whitelist',
            value: 'google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockDeleteRule.mockResolvedValue({ deleted: true });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('google.com')).toBeInTheDocument();
      });

      const deleteButton = screen.getByTitle('Eliminar');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(mockDeleteRule).toHaveBeenCalledWith({ id: '1', groupId: 'group-1' });
      });
    });

    it('calls onDomainsChanged after deleting', async () => {
      mockListRules
        .mockResolvedValueOnce([
          {
            id: '1',
            groupId: 'group-1',
            type: 'whitelist',
            value: 'google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockDeleteRule.mockResolvedValue({ deleted: true });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('google.com')).toBeInTheDocument();
      });

      const deleteButton = screen.getByTitle('Eliminar');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(defaultProps.onDomainsChanged).toHaveBeenCalled();
      });
    });
  });

  describe('Modal Behavior', () => {
    it('calls onClose when modal is closed', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('resets filter to Todos when reopened', async () => {
      mockListRules
        .mockResolvedValueOnce([
          {
            id: '1',
            groupId: 'group-1',
            type: 'whitelist',
            value: 'google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: '2',
            groupId: 'group-1',
            type: 'blocked_subdomain',
            value: 'ads.google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([]);

      const { rerender } = render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('google.com')).toBeInTheDocument();
      });

      // Switch to Bloqueados filter
      fireEvent.click(screen.getByText('Bloqueados'));

      await waitFor(() => {
        expect(screen.queryByText('google.com')).not.toBeInTheDocument();
      });

      // Close modal
      rerender(<DomainManagementModal {...defaultProps} isOpen={false} />);

      // Reset mocks for reopen
      mockListRules
        .mockResolvedValueOnce([
          {
            id: '1',
            groupId: 'group-1',
            type: 'whitelist',
            value: 'google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: '2',
            groupId: 'group-1',
            type: 'blocked_subdomain',
            value: 'ads.google.com',
            comment: null,
            createdAt: '2024-01-01',
          },
        ])
        .mockResolvedValueOnce([]);

      // Reopen modal
      rerender(<DomainManagementModal {...defaultProps} isOpen={true} />);

      await waitFor(() => {
        // Should show all rules (Todos filter active)
        expect(screen.getByText('google.com')).toBeInTheDocument();
        expect(screen.getByText('ads.google.com')).toBeInTheDocument();
      });
    });

    it('calls onDomainsChanged after adding rule', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir regla/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir regla/);
      fireEvent.change(input, { target: { value: 'example.com' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(defaultProps.onDomainsChanged).toHaveBeenCalled();
      });
    });
  });
});
