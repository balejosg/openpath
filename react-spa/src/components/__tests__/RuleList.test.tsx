import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RuleList } from '../RuleList';

// Mock trpc
vi.mock('../../lib/trpc', () => ({
  trpc: {
    groups: {
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

const mockCreateRule = trpc.groups.createRule.mutate as ReturnType<typeof vi.fn>;
const mockDeleteRule = trpc.groups.deleteRule.mutate as ReturnType<typeof vi.fn>;
const mockBulkCreateRules = trpc.groups.bulkCreateRules.mutate as ReturnType<typeof vi.fn>;

describe('RuleList', () => {
  const defaultProps = {
    groupId: 'group-1',
    ruleType: 'whitelist' as const,
    rules: [],
    loading: false,
    onRulesChanged: vi.fn().mockResolvedValue(undefined),
    onToast: vi.fn(),
    placeholder: 'Add domain',
    emptyMessage: 'No domains configured',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders empty state when no rules', () => {
      render(<RuleList {...defaultProps} />);
      expect(screen.getByText('No domains configured')).toBeInTheDocument();
    });

    it('renders loading state', () => {
      render(<RuleList {...defaultProps} loading={true} />);
      expect(screen.getByText('Cargando...')).toBeInTheDocument();
    });

    it('renders list of rules', () => {
      const rules = [
        {
          id: '1',
          groupId: 'group-1',
          type: 'whitelist' as const,
          value: 'google.com',
          comment: null,
          createdAt: '2024-01-01',
        },
        {
          id: '2',
          groupId: 'group-1',
          type: 'whitelist' as const,
          value: 'youtube.com',
          comment: null,
          createdAt: '2024-01-01',
        },
      ];
      render(<RuleList {...defaultProps} rules={rules} />);
      expect(screen.getByText('google.com')).toBeInTheDocument();
      expect(screen.getByText('youtube.com')).toBeInTheDocument();
    });

    it('renders help text when provided', () => {
      render(<RuleList {...defaultProps} helpText="This is help text" />);
      expect(screen.getByText('This is help text')).toBeInTheDocument();
    });

    it('renders tip text when provided', () => {
      render(<RuleList {...defaultProps} tipText="This is a tip" />);
      expect(screen.getByText('This is a tip')).toBeInTheDocument();
    });
  });

  describe('Search/Filter', () => {
    it('filters rules by search term', () => {
      const rules = [
        {
          id: '1',
          groupId: 'group-1',
          type: 'whitelist' as const,
          value: 'google.com',
          comment: null,
          createdAt: '2024-01-01',
        },
        {
          id: '2',
          groupId: 'group-1',
          type: 'whitelist' as const,
          value: 'youtube.com',
          comment: null,
          createdAt: '2024-01-01',
        },
      ];
      render(<RuleList {...defaultProps} rules={rules} />);

      const searchInput = screen.getByPlaceholderText(/Buscar en/);
      fireEvent.change(searchInput, { target: { value: 'google' } });

      expect(screen.getByText('google.com')).toBeInTheDocument();
      expect(screen.queryByText('youtube.com')).not.toBeInTheDocument();
    });

    it('shows no results message when search has no matches', () => {
      const rules = [
        {
          id: '1',
          groupId: 'group-1',
          type: 'whitelist' as const,
          value: 'google.com',
          comment: null,
          createdAt: '2024-01-01',
        },
      ];
      render(<RuleList {...defaultProps} rules={rules} />);

      const searchInput = screen.getByPlaceholderText(/Buscar en/);
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      expect(screen.getByText('No se encontraron resultados')).toBeInTheDocument();
    });
  });

  describe('Adding Rules', () => {
    it('adds a single rule', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });
      render(<RuleList {...defaultProps} />);

      const input = screen.getByPlaceholderText('Add domain');
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

    it('adds rule on Enter key', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });
      render(<RuleList {...defaultProps} />);

      const input = screen.getByPlaceholderText('Add domain');
      fireEvent.change(input, { target: { value: 'example.com' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockCreateRule).toHaveBeenCalled();
      });
    });

    it('bulk adds multiple rules when allowBulkAdd is true', async () => {
      mockBulkCreateRules.mockResolvedValue({ count: 3 });
      render(<RuleList {...defaultProps} allowBulkAdd={true} />);

      const input = screen.getByPlaceholderText('Add domain');
      fireEvent.change(input, { target: { value: 'google.com, youtube.com, example.com' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(mockBulkCreateRules).toHaveBeenCalledWith({
          groupId: 'group-1',
          type: 'whitelist',
          values: ['google.com', 'youtube.com', 'example.com'],
        });
      });
    });

    it('adds rules one by one when allowBulkAdd is false', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });
      render(<RuleList {...defaultProps} allowBulkAdd={false} />);

      const input = screen.getByPlaceholderText('Add domain');
      fireEvent.change(input, { target: { value: 'google.com, youtube.com' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(mockCreateRule).toHaveBeenCalledTimes(2);
      });
    });

    it('strips protocol from pasted URLs', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });
      render(<RuleList {...defaultProps} />);

      const input = screen.getByPlaceholderText('Add domain');
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

    it('shows error for invalid domain format', async () => {
      render(<RuleList {...defaultProps} />);

      const input = screen.getByPlaceholderText('Add domain');
      fireEvent.change(input, { target: { value: 'invalid' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(screen.getByText(/no es un dominio válido/)).toBeInTheDocument();
      });
    });

    it('shows error for duplicate rule', async () => {
      const rules = [
        {
          id: '1',
          groupId: 'group-1',
          type: 'whitelist' as const,
          value: 'google.com',
          comment: null,
          createdAt: '2024-01-01',
        },
      ];
      render(<RuleList {...defaultProps} rules={rules} />);

      const input = screen.getByPlaceholderText('Add domain');
      fireEvent.change(input, { target: { value: 'google.com' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(screen.getByText(/ya existe/)).toBeInTheDocument();
      });
    });

    it('disables button when input is empty or whitespace', () => {
      render(<RuleList {...defaultProps} />);

      const input = screen.getByPlaceholderText('Add domain');
      const button = screen.getByText('Añadir');

      // Initially disabled (empty)
      expect(button).toBeDisabled();

      // Still disabled with whitespace only
      fireEvent.change(input, { target: { value: '   ' } });
      expect(button).toBeDisabled();

      // Enabled with valid content
      fireEvent.change(input, { target: { value: 'example.com' } });
      expect(button).not.toBeDisabled();
    });
  });

  describe('Deleting Rules', () => {
    it('deletes a rule', async () => {
      const rules = [
        {
          id: '1',
          groupId: 'group-1',
          type: 'whitelist' as const,
          value: 'google.com',
          comment: null,
          createdAt: '2024-01-01',
        },
      ];
      mockDeleteRule.mockResolvedValue({ deleted: true });
      render(<RuleList {...defaultProps} rules={rules} />);

      const deleteButton = screen.getByTitle('Eliminar');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(mockDeleteRule).toHaveBeenCalledWith({ id: '1' });
      });
    });

    it('calls onRulesChanged after deleting', async () => {
      const rules = [
        {
          id: '1',
          groupId: 'group-1',
          type: 'whitelist' as const,
          value: 'google.com',
          comment: null,
          createdAt: '2024-01-01',
        },
      ];
      mockDeleteRule.mockResolvedValue({ deleted: true });
      render(<RuleList {...defaultProps} rules={rules} />);

      const deleteButton = screen.getByTitle('Eliminar');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(defaultProps.onRulesChanged).toHaveBeenCalled();
      });
    });

    it('shows toast with undo option after delete', async () => {
      const rules = [
        {
          id: '1',
          groupId: 'group-1',
          type: 'whitelist' as const,
          value: 'google.com',
          comment: null,
          createdAt: '2024-01-01',
        },
      ];
      mockDeleteRule.mockResolvedValue({ deleted: true });
      render(<RuleList {...defaultProps} rules={rules} />);

      const deleteButton = screen.getByTitle('Eliminar');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(defaultProps.onToast).toHaveBeenCalledWith(
          '"google.com" eliminado',
          'success',
          expect.any(Function)
        );
      });
    });
  });

  describe('Custom Validation', () => {
    it('uses custom validatePattern when provided', async () => {
      const customValidate = vi.fn().mockReturnValue({ valid: true });
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<RuleList {...defaultProps} validatePattern={customValidate} />);

      const input = screen.getByPlaceholderText('Add domain');
      fireEvent.change(input, { target: { value: 'test.example.com' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(customValidate).toHaveBeenCalledWith('test.example.com');
      });
    });

    it('shows warning from custom validation', async () => {
      const customValidate = vi.fn().mockReturnValue({
        valid: true,
        warning: 'This is a warning',
      });

      render(<RuleList {...defaultProps} validatePattern={customValidate} />);

      const input = screen.getByPlaceholderText('Add domain');
      fireEvent.change(input, { target: { value: 'example.com' } });

      await waitFor(() => {
        expect(screen.getByText('This is a warning')).toBeInTheDocument();
      });
    });

    it('rejects invalid pattern from custom validation', async () => {
      const customValidate = vi.fn().mockReturnValue({ valid: false });

      render(<RuleList {...defaultProps} validatePattern={customValidate} />);

      const input = screen.getByPlaceholderText('Add domain');
      fireEvent.change(input, { target: { value: 'invalid' } });
      fireEvent.click(screen.getByText('Añadir'));

      await waitFor(() => {
        expect(screen.getByText(/no es un patrón válido/)).toBeInTheDocument();
      });
    });
  });

  describe('Subdomain Rule Type', () => {
    it('validates subdomain patterns with wildcards', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<RuleList {...defaultProps} ruleType="blocked_subdomain" />);

      const input = screen.getByPlaceholderText('Add domain');
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

    it('validates exact subdomain patterns', async () => {
      mockCreateRule.mockResolvedValue({ id: 'new-1' });

      render(<RuleList {...defaultProps} ruleType="blocked_subdomain" />);

      const input = screen.getByPlaceholderText('Add domain');
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
  });
});
