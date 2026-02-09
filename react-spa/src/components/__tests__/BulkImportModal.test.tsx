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

  describe('Drag and Drop', () => {
    const createMockFile = (content: string, name: string, type = 'text/plain'): File => {
      return new File([content], name, { type });
    };

    const createDragEvent = (files: File[]) => {
      const dataTransfer = {
        files,
        items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
        types: ['Files'],
      };
      return { dataTransfer };
    };

    it('shows drag hint text', () => {
      render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

      expect(screen.getByText(/arrastra archivos .txt o .csv aquí/i)).toBeInTheDocument();
    });

    it('shows drag overlay when file is dragged over', () => {
      render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

      const dropZone = screen.getByTestId('drop-zone');
      const mockFile = createMockFile('google.com', 'domains.txt');

      fireEvent.dragEnter(dropZone, createDragEvent([mockFile]));

      expect(screen.getByTestId('drag-overlay')).toBeInTheDocument();
      expect(screen.getByText('Suelta el archivo aquí')).toBeInTheDocument();
    });

    it('hides drag overlay when drag leaves', () => {
      render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

      const dropZone = screen.getByTestId('drop-zone');
      const mockFile = createMockFile('google.com', 'domains.txt');

      fireEvent.dragEnter(dropZone, createDragEvent([mockFile]));
      expect(screen.getByTestId('drag-overlay')).toBeInTheDocument();

      fireEvent.dragLeave(dropZone, createDragEvent([mockFile]));
      expect(screen.queryByTestId('drag-overlay')).not.toBeInTheDocument();
    });

    it('reads and displays content from dropped .txt file', async () => {
      render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

      const dropZone = screen.getByTestId('drop-zone');
      const fileContent = 'google.com\nyoutube.com\nexample.org';
      const mockFile = createMockFile(fileContent, 'domains.txt');

      fireEvent.drop(dropZone, createDragEvent([mockFile]));

      await waitFor(() => {
        expect(screen.getByText('3 dominios detectados')).toBeInTheDocument();
      });
    });

    it('reads and displays content from dropped .csv file', async () => {
      render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

      const dropZone = screen.getByTestId('drop-zone');
      const fileContent = 'google.com,youtube.com,example.org';
      const mockFile = createMockFile(fileContent, 'domains.csv', 'text/csv');

      fireEvent.drop(dropZone, createDragEvent([mockFile]));

      await waitFor(() => {
        expect(screen.getByText('3 dominios detectados')).toBeInTheDocument();
      });
    });

    it('reads and displays content from dropped .list file', async () => {
      render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

      const dropZone = screen.getByTestId('drop-zone');
      const fileContent = 'google.com\nyoutube.com';
      const mockFile = createMockFile(fileContent, 'domains.list', 'application/octet-stream');

      fireEvent.drop(dropZone, createDragEvent([mockFile]));

      await waitFor(() => {
        expect(screen.getByText('2 dominios detectados')).toBeInTheDocument();
      });
    });

    it('appends dropped file content to existing text', async () => {
      render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

      // First type some domains
      const textarea = screen.getByPlaceholderText(/pega los dominios/i);
      await userEvent.type(textarea, 'existing.com');
      expect(screen.getByText('1 dominio detectado')).toBeInTheDocument();

      // Then drop a file
      const dropZone = screen.getByTestId('drop-zone');
      const fileContent = 'google.com\nyoutube.com';
      const mockFile = createMockFile(fileContent, 'domains.txt');

      fireEvent.drop(dropZone, createDragEvent([mockFile]));

      await waitFor(() => {
        expect(screen.getByText('3 dominios detectados')).toBeInTheDocument();
      });
    });

    it('handles multiple dropped files', async () => {
      render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

      const dropZone = screen.getByTestId('drop-zone');
      const file1 = createMockFile('google.com\nyoutube.com', 'file1.txt');
      const file2 = createMockFile('example.org\ntest.com', 'file2.txt');

      fireEvent.drop(dropZone, createDragEvent([file1, file2]));

      await waitFor(() => {
        expect(screen.getByText('4 dominios detectados')).toBeInTheDocument();
      });
    });

    it('shows error for invalid file types', async () => {
      render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

      const dropZone = screen.getByTestId('drop-zone');
      const mockFile = new File(['binary content'], 'image.png', { type: 'image/png' });

      fireEvent.drop(dropZone, createDragEvent([mockFile]));

      await waitFor(() => {
        expect(
          screen.getByText('Solo se permiten archivos de texto (.txt, .csv, .list)')
        ).toBeInTheDocument();
      });
    });

    it('filters comments from dropped file content', async () => {
      render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

      const dropZone = screen.getByTestId('drop-zone');
      const fileContent = '# Comment line\ngoogle.com\n# Another comment\nyoutube.com';
      const mockFile = createMockFile(fileContent, 'domains.txt');

      fireEvent.drop(dropZone, createDragEvent([mockFile]));

      await waitFor(() => {
        expect(screen.getByText('2 dominios detectados')).toBeInTheDocument();
      });
    });

    it('removes duplicates from dropped file content', async () => {
      render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

      const dropZone = screen.getByTestId('drop-zone');
      const fileContent = 'google.com\ngoogle.com\nyoutube.com';
      const mockFile = createMockFile(fileContent, 'domains.txt');

      fireEvent.drop(dropZone, createDragEvent([mockFile]));

      await waitFor(() => {
        expect(screen.getByText('2 dominios detectados')).toBeInTheDocument();
      });
    });

    it('hides overlay after drop', async () => {
      render(<BulkImportModal isOpen={true} onClose={mockOnClose} onImport={mockOnImport} />);

      const dropZone = screen.getByTestId('drop-zone');
      const mockFile = createMockFile('google.com', 'domains.txt');

      // Show overlay
      fireEvent.dragEnter(dropZone, createDragEvent([mockFile]));
      expect(screen.getByTestId('drag-overlay')).toBeInTheDocument();

      // Drop file
      fireEvent.drop(dropZone, createDragEvent([mockFile]));

      // Overlay should be hidden
      expect(screen.queryByTestId('drag-overlay')).not.toBeInTheDocument();
    });
  });
});
