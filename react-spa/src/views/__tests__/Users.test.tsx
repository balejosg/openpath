import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UsersView from '../Users';

const { mockUsersList, mockCreateUser, mockDeleteUser } = vi.hoisted(() => ({
  mockUsersList: vi.fn(),
  mockCreateUser: vi.fn(),
  mockDeleteUser: vi.fn(),
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
        mutate: mockDeleteUser,
      },
    },
  },
}));

describe('Users View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersList.mockResolvedValue([]);
    mockCreateUser.mockResolvedValue({
      id: 'user-created',
      name: 'Usuario Creado',
      email: 'creado@example.com',
      isActive: true,
      roles: [],
    });
    mockDeleteUser.mockResolvedValue({});
  });

  it('shows role selector with default teacher', async () => {
    render(<UsersView />);

    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo Usuario' }));

    const roleSelect = await screen.findByRole('combobox');
    expect((roleSelect as HTMLSelectElement).value).toBe('teacher');
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

  it('uses default teacher role when unchanged', async () => {
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

  it('shows specific message when email format is invalid', async () => {
    mockCreateUser.mockRejectedValueOnce(new Error('Invalid email'));

    render(<UsersView />);

    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo Usuario' }));
    fireEvent.change(await screen.findByPlaceholderText('Nombre completo'), {
      target: { value: 'Usuario Test' },
    });
    fireEvent.change(screen.getByPlaceholderText('usuario@dominio.com'), {
      target: { value: 'a' },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), {
      target: { value: 'SecurePass123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Crear Usuario' }));

    expect(await screen.findByText('El email no es válido')).toBeInTheDocument();
  });

  it('shows duplicate-email message when backend reports conflict', async () => {
    mockCreateUser.mockRejectedValueOnce(new Error('User already exists'));

    render(<UsersView />);

    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo Usuario' }));
    fireEvent.change(await screen.findByPlaceholderText('Nombre completo'), {
      target: { value: 'Usuario Repetido' },
    });
    fireEvent.change(screen.getByPlaceholderText('usuario@dominio.com'), {
      target: { value: 'dup@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), {
      target: { value: 'SecurePass123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Crear Usuario' }));

    expect(await screen.findByText('Ya existe un usuario con ese email')).toBeInTheDocument();
  });

  it('opens delete confirmation modal and deletes user on confirm', async () => {
    mockUsersList.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Delete Me',
        email: 'delete@example.com',
        isActive: true,
        roles: [{ role: 'student' }],
      },
    ]);

    render(<UsersView />);

    await screen.findByText('Delete Me');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar usuario Delete Me' }));

    expect(await screen.findByText('Eliminar Usuario')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar usuario' }));

    await waitFor(() => {
      expect(mockDeleteUser).toHaveBeenCalledWith({ id: 'user-1' });
    });
  });

  it('shows inline error when delete fails', async () => {
    mockUsersList.mockResolvedValue([
      {
        id: 'user-2',
        name: 'Cannot Delete',
        email: 'cant-delete@example.com',
        isActive: true,
        roles: [{ role: 'student' }],
      },
    ]);
    mockDeleteUser.mockRejectedValueOnce(new Error('backend failure'));

    render(<UsersView />);

    await screen.findByText('Cannot Delete');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar usuario Cannot Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar usuario' }));

    expect(
      await screen.findByText('No se pudo eliminar usuario. Intenta nuevamente.')
    ).toBeInTheDocument();
  });
});
