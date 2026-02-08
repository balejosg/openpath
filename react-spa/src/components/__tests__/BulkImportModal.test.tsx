import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkImportModal } from '../BulkImportModal';

describe('BulkImportModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnImport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnImport.mockResolvedValue({ created: 0, total: 0 });
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <BulkImportModal isOpen={false} onClose={mockOnClose} onImport={mockOnImport} />
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders modal when open', () => {
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    expect(screen.getByText('Importar reglas')).toBeInTheDocument();
    expect(screen.getByText('Tipo de regla')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/pega los dominios/i)).toBeInTheDocument();
  });

  it('shows rule type options', () => {
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    expect(screen.getByText('Dominios permitidos')).toBeInTheDocument();
    expect(screen.getByText('Subdominios bloqueados')).toBeInTheDocument();
    expect(screen.getByText('Rutas bloqueadas')).toBeInTheDocument();
  });

  it('counts domains correctly from textarea input', async () => {
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    const textarea = screen.getByPlaceholderText(/pega los dominios/i);
    await userEvent.type(textarea, 'google.com\nyoutube.com\nexample.org');

    expect(screen.getByText('3 dominios detectados')).toBeInTheDocument();
  });

  it('shows singular text for single domain', async () => {
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    const textarea = screen.getByPlaceholderText(/pega los dominios/i);
    await userEvent.type(textarea, 'google.com');

    expect(screen.getByText('1 dominio detectado')).toBeInTheDocument();
  });

  it('handles comma-separated values', async () => {
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    const textarea = screen.getByPlaceholderText(/pega los dominios/i);
    await userEvent.type(textarea, 'google.com, youtube.com, example.org');

    expect(screen.getByText('3 dominios detectados')).toBeInTheDocument();
  });

  it('filters out duplicate domains', async () => {
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    const textarea = screen.getByPlaceholderText(/pega los dominios/i);
    await userEvent.type(textarea, 'google.com\ngoogle.com\nyoutube.com');

    expect(screen.getByText('2 dominios detectados')).toBeInTheDocument();
  });

  it('filters out comment lines starting with #', async () => {
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    const textarea = screen.getByPlaceholderText(/pega los dominios/i);
    await userEvent.type(
      textarea,
      '# This is a comment\ngoogle.com\n# Another comment\nyoutube.com'
    );

    expect(screen.getByText('2 dominios detectados')).toBeInTheDocument();
  });

  it('disables import button when no domains entered', () => {
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    const importButton = screen.getByRole('button', { name: /importar/i });
    expect(importButton).toBeDisabled();
  });

  it('enables import button when domains are entered', async () => {
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    const textarea = screen.getByPlaceholderText(/pega los dominios/i);
    await userEvent.type(textarea, 'google.com');

    const importButton = screen.getByRole('button', { name: /importar/i });
    expect(importButton).not.toBeDisabled();
  });

  it('calls onImport with correct values when import clicked', async () => {
    mockOnImport.mockResolvedValue({ created: 2, total: 2 });
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    const textarea = screen.getByPlaceholderText(/pega los dominios/i);
    await userEvent.type(textarea, 'google.com\nyoutube.com');

    const importButton = screen.getByRole('button', { name: /importar/i });
    fireEvent.click(importButton);

    await waitFor(() => {
      expect(mockOnImport).toHaveBeenCalledWith(['google.com', 'youtube.com'], 'whitelist');
    });
  });

  it('allows selecting different rule types', async () => {
    mockOnImport.mockResolvedValue({ created: 1, total: 1 });
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    // Select blocked_subdomain type
    const blockedOption = screen.getByText('Subdominios bloqueados');
    fireEvent.click(blockedOption);

    const textarea = screen.getByPlaceholderText(/pega los dominios/i);
    await userEvent.type(textarea, 'ads.example.com');

    const importButton = screen.getByRole('button', { name: /importar/i });
    fireEvent.click(importButton);

    await waitFor(() => {
      expect(mockOnImport).toHaveBeenCalledWith(['ads.example.com'], 'blocked_subdomain');
    });
  });

  it('closes modal on successful import', async () => {
    mockOnImport.mockResolvedValue({ created: 1, total: 1 });
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    const textarea = screen.getByPlaceholderText(/pega los dominios/i);
    await userEvent.type(textarea, 'google.com');

    const importButton = screen.getByRole('button', { name: /importar/i });
    fireEvent.click(importButton);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('shows error when all rules already exist', async () => {
    mockOnImport.mockResolvedValue({ created: 0, total: 2 });
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    const textarea = screen.getByPlaceholderText(/pega los dominios/i);
    await userEvent.type(textarea, 'google.com\nyoutube.com');

    const importButton = screen.getByRole('button', { name: /importar/i });
    fireEvent.click(importButton);

    await waitFor(() => {
      expect(screen.getByText('Todas las reglas ya existen')).toBeInTheDocument();
    });

    // Modal should NOT close
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('calls onClose when cancel button is clicked', () => {
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    const cancelButton = screen.getByRole('button', { name: /cancelar/i });
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows count in import button', async () => {
    render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

    const textarea = screen.getByPlaceholderText(/pega los dominios/i);
    await userEvent.type(textarea, 'google.com\nyoutube.com\nexample.org');

    const importButton = screen.getByRole('button', { name: /importar \(3\)/i });
    expect(importButton).toBeInTheDocument();
  });
});
