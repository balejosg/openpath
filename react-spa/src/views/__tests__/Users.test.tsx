import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersView from '../Users';

let queryClient: QueryClient | null = null;

function renderUsersView() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <UsersView />
    </QueryClientProvider>
  );
}

afterEach(() => {
  queryClient?.clear();
  queryClient = null;
});

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
    renderUsersView();

    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo Usuario' }));

    const roleSelect = await screen.findByRole('combobox');
    expect((roleSelect as HTMLSelectElement).value).toBe('teacher');
  });

  it('sends selected role in create mutation', async () => {
    renderUsersView();

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
    renderUsersView();

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
    renderUsersView();

    expect(await screen.findByText('Mostrando 0-0 de 0 usuarios')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('shows feedback when exporting with no users', async () => {
    renderUsersView();

    await screen.findByText('Mostrando 0-0 de 0 usuarios');
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));

    expect(screen.getByRole('status')).toHaveTextContent('No hay usuarios para exportar');
  });

  it('shows specific message when email format is invalid', async () => {
    mockCreateUser.mockRejectedValueOnce(new Error('Invalid email'));

    renderUsersView();

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

    renderUsersView();

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

  it('keeps existing rows visible while refreshing and ignores stale list responses after create', async () => {
    const firstList = createDeferred<unknown[]>();
    const secondList = createDeferred<unknown[]>();

    mockUsersList.mockImplementationOnce(() => firstList.promise);
    mockUsersList.mockImplementationOnce(() => secondList.promise);

    renderUsersView();

    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo Usuario' }));
    fireEvent.change(await screen.findByPlaceholderText('Nombre completo'), {
      target: { value: 'Usuario Creado' },
    });
    fireEvent.change(screen.getByPlaceholderText('usuario@dominio.com'), {
      target: { value: 'creado@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), {
      target: { value: 'SecurePass123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Crear Usuario' }));

    // Optimistic insert should render immediately and should NOT replace the grid
    // with the initial loading state.
    expect(await screen.findByText('Usuario Creado')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Cargando usuarios...')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockUsersList).toHaveBeenCalledTimes(2);
    });

    // While the post-create refresh is in-flight, the grid should remain visible.
    expect(screen.getByLabelText('Actualizando usuarios')).toBeInTheDocument();

    // Newer fetch returns the created user.
    secondList.resolve([
      {
        id: 'user-created',
        name: 'Usuario Creado',
        email: 'creado@example.com',
        isActive: true,
        roles: [],
      },
    ]);

    await waitFor(() => {
      expect(screen.queryByLabelText('Actualizando usuarios')).not.toBeInTheDocument();
    });

    // Older in-flight fetch resolves after: it should be ignored.
    firstList.resolve([]);

    // Allow any stale promise handlers to run.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('Usuario Creado')).toBeInTheDocument();
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

    renderUsersView();

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

    renderUsersView();

    await screen.findByText('Cannot Delete');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar usuario Cannot Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar usuario' }));

    expect(
      await screen.findByText('No se pudo eliminar usuario. Intenta nuevamente.')
    ).toBeInTheDocument();
  });
});
