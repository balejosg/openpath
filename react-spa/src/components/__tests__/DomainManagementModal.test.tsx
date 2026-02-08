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

    // Default mock implementations
    mockListRules.mockResolvedValue([]);
  });

  it('renders modal with group name in title', async () => {
    mockListRules.mockResolvedValue([]);

    render(<DomainManagementModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Dominios Permitidos: test-group/)).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    // Create a promise that never resolves to keep loading state
    mockListRules.mockReturnValue(
      new Promise<never>(() => {
        // Intentionally never resolves
      })
    );

    render(<DomainManagementModal {...defaultProps} />);

    expect(screen.getByText('Cargando dominios...')).toBeInTheDocument();
  });

  it('displays empty state when no domains', async () => {
    mockListRules.mockResolvedValue([]);

    render(<DomainManagementModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('No hay dominios configurados')).toBeInTheDocument();
    });
  });

  it('displays list of domains', async () => {
    mockListRules.mockResolvedValue([
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
    ]);

    render(<DomainManagementModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('google.com')).toBeInTheDocument();
      expect(screen.getByText('youtube.com')).toBeInTheDocument();
    });
  });

  it('filters domains by search', async () => {
    mockListRules.mockResolvedValue([
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
    ]);

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
    mockListRules.mockResolvedValue([]);
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
    mockListRules.mockResolvedValue([]);
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
    mockListRules.mockResolvedValue([]);
    mockBulkCreateRules.mockResolvedValue({ count: 3 });

    render(<DomainManagementModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Añadir dominio/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Añadir dominio/);
    // Use comma-separated domains (text inputs don't preserve newlines)
    fireEvent.change(input, {
      target: { value: 'google.com, youtube.com, wikipedia.org' },
    });

    const addButton = screen.getByText('Añadir');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockBulkCreateRules).toHaveBeenCalledWith({
        groupId: 'group-1',
        type: 'whitelist',
        values: ['google.com', 'youtube.com', 'wikipedia.org'],
      });
    });
  });

  it('shows error for invalid domain format', async () => {
    mockListRules.mockResolvedValue([]);

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
    mockListRules.mockResolvedValue([
      {
        id: '1',
        groupId: 'group-1',
        type: 'whitelist',
        value: 'google.com',
        comment: null,
        createdAt: '2024-01-01',
      },
    ]);

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
    const rule = {
      id: '1',
      groupId: 'group-1',
      type: 'whitelist',
      value: 'google.com',
      comment: null,
      createdAt: '2024-01-01',
    };
    mockListRules.mockResolvedValue([rule]);
    mockDeleteRule.mockResolvedValue({ deleted: true });

    render(<DomainManagementModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('google.com')).toBeInTheDocument();
    });

    // Find the delete button (trash icon)
    const deleteButton = screen.getByTitle('Eliminar');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockDeleteRule).toHaveBeenCalledWith({ id: '1' });
    });
  });

  it('calls onDomainsChanged after adding domain', async () => {
    mockListRules.mockResolvedValue([]);
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

  it('calls onClose when modal is closed', async () => {
    mockListRules.mockResolvedValue([]);

    render(<DomainManagementModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Press escape to close
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('strips protocol from pasted URLs', async () => {
    mockListRules.mockResolvedValue([]);
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

  it('shows advanced options section', async () => {
    mockListRules.mockResolvedValue([]);

    render(<DomainManagementModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Opciones avanzadas')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Opciones avanzadas'));

    expect(screen.getByText(/Subdominios bloqueados/)).toBeInTheDocument();
    expect(screen.getByText(/Rutas bloqueadas/)).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<DomainManagementModal {...defaultProps} isOpen={false} />);

    expect(screen.queryByText(/Dominios Permitidos/)).not.toBeInTheDocument();
  });
});
