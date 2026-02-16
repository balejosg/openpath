import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DomainRequests from '../DomainRequests';

const { mockListRequests, mockListGroups, mockApprove, mockReject } = vi.hoisted(() => ({
  mockListRequests: vi.fn(),
  mockListGroups: vi.fn(),
  mockApprove: vi.fn(),
  mockReject: vi.fn(),
}));

vi.mock('../../lib/trpc', () => ({
  trpc: {
    requests: {
      list: {
        query: mockListRequests,
      },
      listGroups: {
        query: mockListGroups,
      },
      approve: {
        mutate: mockApprove,
      },
      reject: {
        mutate: mockReject,
      },
      delete: {
        mutate: vi.fn(),
      },
    },
  },
}));

describe('DomainRequests - Original group approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListRequests.mockResolvedValue([
      {
        id: 'req-1',
        domain: 'example.com',
        reason: 'Need for class',
        requesterEmail: 'teacher@example.com',
        groupId: 'group-1',
        priority: 'normal',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resolvedAt: null,
        resolvedBy: null,
      },
    ]);
    mockListGroups.mockResolvedValue([{ id: 'group-1', path: 'group-1', name: 'Grupo 1' }]);
    mockApprove.mockResolvedValue({ success: true });
    mockReject.mockResolvedValue({ success: true });
  });

  it('approves using request id only and shows original group', async () => {
    render(<DomainRequests />);

    await screen.findByText('example.com');
    fireEvent.click(screen.getByTitle('Aprobar'));

    expect(await screen.findByText(/grupo original/i)).toBeInTheDocument();
    expect(screen.queryByText('Grupo de destino')).not.toBeInTheDocument();

    const approveButtons = screen.getAllByRole('button', { name: 'Aprobar' });
    const modalApproveButton = approveButtons.at(-1);
    if (!modalApproveButton) {
      throw new Error('Modal approve button not found');
    }
    fireEvent.click(modalApproveButton);

    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledWith({ id: 'req-1' });
    });
  });

  it('refreshes list when the window regains focus', async () => {
    render(<DomainRequests />);

    await waitFor(() => {
      expect(mockListRequests).toHaveBeenCalledTimes(1);
    });

    fireEvent(window, new Event('focus'));

    await waitFor(() => {
      expect(mockListRequests).toHaveBeenCalledTimes(2);
    });
  });

  it('clears bulk reject reason when clearing selection', async () => {
    render(<DomainRequests />);

    await screen.findByText('example.com');
    fireEvent.click(screen.getByLabelText('Seleccionar example.com'));

    const reasonInput = screen.getByPlaceholderText('Motivo para rechazo en lote (opcional)');
    fireEvent.change(reasonInput, { target: { value: 'No aplica' } });
    expect(screen.getByDisplayValue('No aplica')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar seleccion' }));

    expect(screen.queryByDisplayValue('No aplica')).not.toBeInTheDocument();
  });

  it('asks confirmation before bulk approve', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<DomainRequests />);

    await screen.findByText('example.com');
    fireEvent.click(screen.getByLabelText('Seleccionar example.com'));
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar seleccionadas' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockApprove).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('asks confirmation before bulk reject', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<DomainRequests />);

    await screen.findByText('example.com');
    fireEvent.click(screen.getByLabelText('Seleccionar example.com'));
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar seleccionadas' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockReject).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('clears search and restores the table when using clear button', async () => {
    render(<DomainRequests />);

    await screen.findByText('example.com');

    const searchInput = screen.getByPlaceholderText('Buscar por dominio o email...');
    fireEvent.change(searchInput, { target: { value: 'zzzz-not-found' } });

    expect(
      screen.getByText('No se encontraron solicitudes con los filtros aplicados')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar busqueda' }));

    expect(searchInput).toHaveValue('');
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('matches search even with extra spaces and uppercase text', async () => {
    render(<DomainRequests />);

    await screen.findByText('example.com');

    const searchInput = screen.getByPlaceholderText('Buscar por dominio o email...');
    fireEvent.change(searchInput, { target: { value: '   EXAMPLE.COM   ' } });

    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(
      screen.queryByText('No se encontraron solicitudes con los filtros aplicados')
    ).not.toBeInTheDocument();
  });
});
