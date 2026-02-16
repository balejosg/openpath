import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Settings from '../Settings';

const { mockChangePassword, mockListTokens, mockCreateToken } = vi.hoisted(() => ({
  mockChangePassword: vi.fn(),
  mockListTokens: vi.fn(),
  mockCreateToken: vi.fn(),
}));

vi.mock('../../lib/trpc', () => ({
  trpc: {
    healthcheck: {
      systemInfo: {
        query: vi.fn().mockResolvedValue({
          version: '1.0.0',
          database: { connected: true, type: 'postgresql' },
          session: {
            accessTokenExpiry: '24h',
            accessTokenExpiryHuman: '24 horas',
            refreshTokenExpiry: '7d',
            refreshTokenExpiryHuman: '7 dias',
          },
          uptime: 1,
        }),
      },
    },
    apiTokens: {
      list: {
        query: mockListTokens,
      },
      create: { mutate: mockCreateToken },
      revoke: { mutate: vi.fn() },
      regenerate: { mutate: vi.fn() },
    },
    auth: {
      changePassword: {
        mutate: mockChangePassword,
      },
    },
  },
}));

describe('Settings View - Change Password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockChangePassword.mockResolvedValue({ success: true });
    mockListTokens.mockResolvedValue([]);
    mockCreateToken.mockResolvedValue({
      id: 'new-token-id',
      name: 'api-token',
      token: 'op_example_token_value',
      expiresAt: null,
      createdAt: new Date().toISOString(),
    });
  });

  it('blocks submit when required fields are missing', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar Contraseña' }));

    expect(await screen.findByText('Todos los campos son obligatorios')).toBeInTheDocument();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('shows API error when change password fails', async () => {
    mockChangePassword.mockRejectedValueOnce(new Error('invalid current password'));

    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    fireEvent.change(screen.getByPlaceholderText('Ingresa tu contraseña actual'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), {
      target: { value: 'NewPassword123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repite la nueva contraseña'), {
      target: { value: 'NewPassword123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar Contraseña' }));

    expect(
      await screen.findByText('No se pudo cambiar la contraseña. Verifica tu contraseña actual.')
    ).toBeInTheDocument();
  });

  it('calls API and shows success message', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    fireEvent.change(screen.getByPlaceholderText('Ingresa tu contraseña actual'), {
      target: { value: 'CurrentPassword123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), {
      target: { value: 'NewPassword123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repite la nueva contraseña'), {
      target: { value: 'NewPassword123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar Contraseña' }));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith({
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword123!',
      });
    });

    expect(await screen.findByText('¡Contraseña actualizada correctamente!')).toBeInTheDocument();
  });

  it('closes create token modal via Cancelar, X and Escape after validation error', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: 'Crear token' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear Token' }));
    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByText('Crear Token API')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Crear token' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear Token' }));
    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar modal de token API' }));
    await waitFor(() => {
      expect(screen.queryByText('Crear Token API')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Crear token' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear Token' }));
    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('Crear Token API')).not.toBeInTheDocument();
    });
  });

  it('clears required error when token name is corrected and allows submit', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: 'Crear token' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear Token' }));
    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Ej: API de producción'), {
      target: { value: '  api-token-fixed  ' },
    });

    await waitFor(() => {
      expect(screen.queryByText('El nombre es obligatorio')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Crear Token' }));

    await waitFor(() => {
      expect(mockCreateToken).toHaveBeenCalledWith({
        name: 'api-token-fixed',
        expiresInDays: undefined,
      });
    });
  });

  it('persists notification toggles across remounts', async () => {
    const { unmount } = render(<Settings />);

    const weeklyReportsCheckbox = await screen.findByRole('checkbox', {
      name: 'Reportes semanales',
    });
    expect(weeklyReportsCheckbox).not.toBeChecked();

    fireEvent.click(weeklyReportsCheckbox);
    expect(weeklyReportsCheckbox).toBeChecked();

    unmount();
    render(<Settings />);

    expect(await screen.findByRole('checkbox', { name: 'Reportes semanales' })).toBeChecked();
  });
});
