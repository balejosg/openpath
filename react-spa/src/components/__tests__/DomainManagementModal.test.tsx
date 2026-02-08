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
const mockBulkCreateRules = trpc.groups.bulkCreateRules.mutate as ReturnType<typeof vi.fn>;

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
      // Create a promise that never resolves to keep loading state
      mockListRules.mockReturnValue(
        new Promise<never>(() => {
          // Intentionally never resolves
        })
      );

      render(<DomainManagementModal {...defaultProps} />);

      expect(screen.getByText('Cargando...')).toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    it('renders all three tabs', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Dominios')).toBeInTheDocument();
        expect(screen.getByText('Subdominios bloqueados')).toBeInTheDocument();
        expect(screen.getByText(/Rutas bloqueadas/)).toBeInTheDocument();
      });
    });

    it('starts with Dominios tab active', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        const dominiosTab = screen.getByText('Dominios');
        expect(dominiosTab).toHaveClass('text-blue-600');
      });
    });

    it('switches to Subdominios tab when clicked', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Dominios')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Subdominios bloqueados'));

      await waitFor(() => {
        // Check that help text for subdomains is shown
        expect(
          screen.getByText(/Los dominios en la lista blanca permiten automáticamente/)
        ).toBeInTheDocument();
      });
    });

    it('switches to Rutas bloqueadas tab when clicked', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Dominios')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Rutas bloqueadas/));

      await waitFor(() => {
        // Check that help text for paths is shown
        expect(screen.getByText(/Bloquea URLs específicas/)).toBeInTheDocument();
      });
    });

    it('shows path placeholder when Rutas bloqueadas tab is active', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Rutas bloqueadas/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Rutas bloqueadas/));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir ruta/)).toBeInTheDocument();
      });
    });

    it('shows count badges on tabs when rules exist', async () => {
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
        expect(screen.getByText('2')).toBeInTheDocument(); // whitelist count
        expect(screen.getByText('1')).toBeInTheDocument(); // subdomain count
      });
    });
  });

  describe('Whitelist Tab (Dominios)', () => {
    it('displays empty state when no domains', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No hay dominios configurados')).toBeInTheDocument();
      });
    });

    it('displays list of domains', async () => {
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
        expect(screen.getByText('youtube.com')).toBeInTheDocument();
      });
    });

    it('filters domains by search', async () => {
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

    it('adds a single domain', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir dominio/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir dominio/);
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

    it('adds domain on Enter key', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir dominio/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir dominio/);
      fireEvent.change(input, { target: { value: 'example.com' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockCreateRule).toHaveBeenCalled();
      });
    });

    it('bulk adds multiple domains', async () => {
      mockBulkCreateRules.mockResolvedValue({ count: 3 });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir dominio/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir dominio/);
      fireEvent.change(input, { target: { value: 'google.com, youtube.com, wikipedia.org' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(mockBulkCreateRules).toHaveBeenCalledWith({
          groupId: 'group-1',
          type: 'whitelist',
          values: ['google.com', 'youtube.com', 'wikipedia.org'],
        });
      });
    });

    it('shows error for invalid domain format', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir dominio/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir dominio/);
      fireEvent.change(input, { target: { value: 'invalid' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(screen.getByText(/no es un dominio válido/)).toBeInTheDocument();
      });
    });

    it('shows error for duplicate domain', async () => {
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

      const input = screen.getByPlaceholderText(/Añadir dominio/);
      fireEvent.change(input, { target: { value: 'google.com' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(screen.getByText(/ya existe/)).toBeInTheDocument();
      });
    });

    it('deletes a domain', async () => {
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
        expect(mockDeleteRule).toHaveBeenCalledWith({ id: '1' });
      });
    });

    it('calls onDomainsChanged after adding domain', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir dominio/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir dominio/);
      fireEvent.change(input, { target: { value: 'example.com' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(defaultProps.onDomainsChanged).toHaveBeenCalled();
      });
    });

    it('strips protocol from pasted URLs', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir dominio/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir dominio/);
      fireEvent.change(input, { target: { value: 'https://example.com/path' } });
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

  describe('Subdomain Tab', () => {
    it('shows help text when subdomain tab is active', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Subdominios bloqueados')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Subdominios bloqueados'));

      await waitFor(() => {
        expect(
          screen.getByText(/Los dominios en la lista blanca permiten automáticamente/)
        ).toBeInTheDocument();
      });
    });

    it('shows subdomain placeholder when tab is active', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Subdominios bloqueados')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Subdominios bloqueados'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir subdominio/)).toBeInTheDocument();
      });
    });

    it('adds a subdomain rule', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Subdominios bloqueados')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Subdominios bloqueados'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir subdominio/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir subdominio/);
      fireEvent.change(input, { target: { value: 'ads.google.com' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(mockCreateRule).toHaveBeenCalledWith({
          groupId: 'group-1',
          type: 'blocked_subdomain',
          value: 'ads.google.com',
        });
      });
    });

    it('adds a wildcard subdomain rule', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Subdominios bloqueados')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Subdominios bloqueados'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir subdominio/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir subdominio/);
      fireEvent.change(input, { target: { value: '*.tracking.example.com' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(mockCreateRule).toHaveBeenCalledWith({
          groupId: 'group-1',
          type: 'blocked_subdomain',
          value: '*.tracking.example.com',
        });
      });
    });

    it('shows warning for root domain in subdomain tab', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Subdominios bloqueados')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Subdominios bloqueados'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir subdominio/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir subdominio/);
      fireEvent.change(input, { target: { value: 'google.com' } });

      await waitFor(() => {
        expect(screen.getByText(/Debería estar en la lista blanca/)).toBeInTheDocument();
      });
    });
  });

  describe('Path Rules Tab (Rutas bloqueadas)', () => {
    it('shows help text when path tab is active', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Rutas bloqueadas/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Rutas bloqueadas/));

      await waitFor(() => {
        expect(screen.getByText(/Bloquea URLs específicas/)).toBeInTheDocument();
      });
    });

    it('shows browser-only tip text', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Rutas bloqueadas/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Rutas bloqueadas/));

      await waitFor(() => {
        expect(screen.getByText(/Solo funciona en navegadores/)).toBeInTheDocument();
      });
    });

    it('adds a path rule with domain', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Rutas bloqueadas/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Rutas bloqueadas/));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir ruta/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir ruta/);
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

    it('adds a domain-agnostic path rule', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Rutas bloqueadas/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Rutas bloqueadas/));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir ruta/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir ruta/);
      fireEvent.change(input, { target: { value: '*/tracking.js' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(mockCreateRule).toHaveBeenCalledWith({
          groupId: 'group-1',
          type: 'blocked_path',
          value: '*/tracking.js',
        });
      });
    });

    it('shows warning for domain-agnostic path rule', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Rutas bloqueadas/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Rutas bloqueadas/));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir ruta/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir ruta/);
      fireEvent.change(input, { target: { value: '*/ads/*' } });

      await waitFor(() => {
        expect(screen.getByText(/bloqueará esta ruta en TODOS los sitios/)).toBeInTheDocument();
      });
    });

    it('rejects path without slash', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Rutas bloqueadas/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Rutas bloqueadas/));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir ruta/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir ruta/);
      fireEvent.change(input, { target: { value: 'facebook.com' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(screen.getByText(/no es un patrón válido/)).toBeInTheDocument();
      });
    });

    it('adds a wildcard subdomain path rule', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Rutas bloqueadas/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Rutas bloqueadas/));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir ruta/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir ruta/);
      fireEvent.change(input, { target: { value: '*.example.com/ads/*' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(mockCreateRule).toHaveBeenCalledWith({
          groupId: 'group-1',
          type: 'blocked_path',
          value: '*.example.com/ads/*',
        });
      });
    });

    it('strips protocol from pasted path URLs', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Rutas bloqueadas/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Rutas bloqueadas/));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir ruta/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir ruta/);
      fireEvent.change(input, { target: { value: 'https://facebook.com/gaming' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(mockCreateRule).toHaveBeenCalledWith({
          groupId: 'group-1',
          type: 'blocked_path',
          value: 'facebook.com/gaming',
        });
      });
    });

    it('bulk adds multiple path rules', async () => {
      mockBulkCreateRules.mockResolvedValue({ count: 2 });

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Rutas bloqueadas/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Rutas bloqueadas/));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Añadir ruta/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Añadir ruta/);
      fireEvent.change(input, {
        target: { value: 'facebook.com/gaming, youtube.com/shorts' },
      });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(mockBulkCreateRules).toHaveBeenCalledWith({
          groupId: 'group-1',
          type: 'blocked_path',
          values: ['facebook.com/gaming', 'youtube.com/shorts'],
        });
      });
    });

    it('displays existing path rules', async () => {
      mockListRules
        .mockResolvedValueOnce([]) // whitelist
        .mockResolvedValueOnce([]) // blocked_subdomain
        .mockResolvedValueOnce([
          {
            id: '1',
            groupId: 'group-1',
            type: 'blocked_path',
            value: 'facebook.com/gaming',
            comment: null,
            createdAt: '2024-01-01',
          },
        ]); // blocked_path

      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Rutas bloqueadas/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Rutas bloqueadas/));

      await waitFor(() => {
        expect(screen.getByText('facebook.com/gaming')).toBeInTheDocument();
      });
    });
  });

  describe('Modal Behavior', () => {
    it('calls onClose when modal is closed', async () => {
      render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Press escape to close
      fireEvent.keyDown(window, { key: 'Escape' });

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('resets to Dominios tab when reopened', async () => {
      const { rerender } = render(<DomainManagementModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Dominios')).toBeInTheDocument();
      });

      // Switch to subdomain tab
      fireEvent.click(screen.getByText('Subdominios bloqueados'));

      // Close modal
      rerender(<DomainManagementModal {...defaultProps} isOpen={false} />);

      // Reopen modal
      rerender(<DomainManagementModal {...defaultProps} isOpen={true} />);

      await waitFor(() => {
        // Should be back on Dominios tab (check for placeholder)
        expect(screen.getByPlaceholderText(/Añadir dominio/)).toBeInTheDocument();
      });
    });
  });
});
