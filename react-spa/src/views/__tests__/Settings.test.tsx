import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Settings from '../Settings';

const { mockChangePassword } = vi.hoisted(() => ({
  mockChangePassword: vi.fn(),
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
        query: vi.fn().mockResolvedValue([]),
      },
      create: { mutate: vi.fn() },
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
    mockChangePassword.mockResolvedValue({ success: true });
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
});
