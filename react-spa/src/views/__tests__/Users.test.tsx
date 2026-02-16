import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UsersView from '../Users';

const { mockUsersList, mockCreateUser } = vi.hoisted(() => ({
  mockUsersList: vi.fn(),
  mockCreateUser: vi.fn(),
}));

vi.mock('../../lib/trpc', () => ({
  trpc: {
    users: {
      list: {
        query: mockUsersList,
      },
      create: {
        mutate: mockCreateUser,
      },
      update: {
        mutate: vi.fn(),
      },
      delete: {
        mutate: vi.fn(),
      },
    },
  },
}));

describe('Users View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersList.mockResolvedValue([]);
    mockCreateUser.mockResolvedValue({});
  });

  it('shows role selector with default student', async () => {
    render(<UsersView />);

    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo Usuario' }));

    const roleSelect = await screen.findByRole('combobox');
    expect((roleSelect as HTMLSelectElement).value).toBe('student');
  });

  it('sends selected role in create mutation', async () => {
    render(<UsersView />);

    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo Usuario' }));

    fireEvent.change(await screen.findByPlaceholderText('Nombre completo'), {
      target: { value: 'Teacher User' },
    });
    fireEvent.change(screen.getByPlaceholderText('usuario@dominio.com'), {
      target: { value: 'teacher@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), {
      target: { value: 'SecurePass123!' },
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'teacher' } });

    fireEvent.click(screen.getByRole('button', { name: 'Crear Usuario' }));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith({
        name: 'Teacher User',
        email: 'teacher@example.com',
        password: 'SecurePass123!',
        role: 'teacher',
      });
    });
  });

  it('uses default student role when unchanged', async () => {
    render(<UsersView />);

    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo Usuario' }));

    fireEvent.change(await screen.findByPlaceholderText('Nombre completo'), {
      target: { value: 'Student User' },
    });
    fireEvent.change(screen.getByPlaceholderText('usuario@dominio.com'), {
      target: { value: 'student@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), {
      target: { value: 'SecurePass123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Crear Usuario' }));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith({
        name: 'Student User',
        email: 'student@example.com',
        password: 'SecurePass123!',
        role: 'student',
      });
    });
  });

  it('shows valid empty pagination range and disables navigation on empty state', async () => {
    render(<UsersView />);

    expect(await screen.findByText('Mostrando 0-0 de 0 usuarios')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('shows feedback when exporting with no users', async () => {
    render(<UsersView />);

    await screen.findByText('Mostrando 0-0 de 0 usuarios');
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));

    expect(screen.getByRole('status')).toHaveTextContent('No hay usuarios para exportar');
  });
});
