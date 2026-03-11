import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Settings from '../Settings';
import Register from '../Register';

const { mockChangePassword, mockRegister, mockReportError } = vi.hoisted(() => ({
  mockChangePassword: vi.fn(),
  mockRegister: vi.fn(),
  mockReportError: vi.fn(),
}));

vi.mock('../../lib/trpc', () => ({
  trpc: {
    auth: {
      changePassword: {
        mutate: mockChangePassword,
      },
      register: {
        mutate: mockRegister,
      },
    },
  },
}));

vi.mock('../../lib/reportError', () => ({
  reportError: mockReportError,
}));

describe('Settings View - Change Password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockChangePassword.mockResolvedValue({ success: true });
    mockRegister.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not render deprecated operational or API token sections', () => {
    render(<Settings />);

    expect(screen.queryByText('API Keys')).not.toBeInTheDocument();
    expect(screen.queryByText('Base de Datos')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear token' })).not.toBeInTheDocument();
    expect(screen.queryByText(/OpenPath v/i)).not.toBeInTheDocument();
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

  it('validates password length and confirmation before calling the API', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    fireEvent.change(screen.getByPlaceholderText('Ingresa tu contraseña actual'), {
      target: { value: 'CurrentPassword123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repite la nueva contraseña'), {
      target: { value: 'short' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar Contraseña' }));
    expect(
      await screen.findByText('La nueva contraseña debe tener al menos 8 caracteres')
    ).toBeInTheDocument();
    expect(mockChangePassword).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), {
      target: { value: 'NewPassword123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repite la nueva contraseña'), {
      target: { value: 'MismatchPassword123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar Contraseña' }));
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('closes and resets the modal after a successful password change', async () => {
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

    expect(await screen.findByText('¡Contraseña actualizada correctamente!')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(
          screen.queryByText('¡Contraseña actualizada correctamente!')
        ).not.toBeInTheDocument();
      },
      { timeout: 2500 }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(screen.getByPlaceholderText('Ingresa tu contraseña actual')).toHaveValue('');
    expect(screen.getByPlaceholderText('Mínimo 8 caracteres')).toHaveValue('');
    expect(screen.getByPlaceholderText('Repite la nueva contraseña')).toHaveValue('');
  });

  it('closes the modal and clears previous validation state when cancelled', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    fireEvent.change(screen.getByPlaceholderText('Ingresa tu contraseña actual'), {
      target: { value: 'CurrentPassword123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), {
      target: { value: 'MismatchPassword123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repite la nueva contraseña'), {
      target: { value: 'OtherPassword123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar Contraseña' }));

    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByText('Las contraseñas no coinciden')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(screen.queryByText('Las contraseñas no coinciden')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ingresa tu contraseña actual')).toHaveValue('');
  });

  it('persists notification toggles across remounts', async () => {
    const { unmount } = render(<Settings />);

    const securityAlertsCheckbox = await screen.findByRole('checkbox', {
      name: 'Alertas de seguridad',
    });
    const domainRequestsCheckbox = await screen.findByRole('checkbox', {
      name: 'Nuevas solicitudes de dominio',
    });
    const weeklyReportsCheckbox = await screen.findByRole('checkbox', {
      name: 'Reportes semanales',
    });
    expect(securityAlertsCheckbox).toBeChecked();
    expect(domainRequestsCheckbox).toBeChecked();
    expect(weeklyReportsCheckbox).not.toBeChecked();

    fireEvent.click(securityAlertsCheckbox);
    fireEvent.click(domainRequestsCheckbox);
    fireEvent.click(weeklyReportsCheckbox);
    expect(securityAlertsCheckbox).not.toBeChecked();
    expect(domainRequestsCheckbox).not.toBeChecked();
    expect(weeklyReportsCheckbox).toBeChecked();

    unmount();
    render(<Settings />);

    expect(await screen.findByRole('checkbox', { name: 'Alertas de seguridad' })).not.toBeChecked();
    expect(
      await screen.findByRole('checkbox', { name: 'Nuevas solicitudes de dominio' })
    ).not.toBeChecked();
    expect(await screen.findByRole('checkbox', { name: 'Reportes semanales' })).toBeChecked();
  });
});

describe('Register View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegister.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not expose Google signup affordances', () => {
    const onRegister = vi.fn();
    const onNavigateToLogin = vi.fn();

    render(<Register onRegister={onRegister} onNavigateToLogin={onNavigateToLogin} />);

    expect(screen.getByText('Registro Institucional')).toBeInTheDocument();
    expect(screen.queryByText(/google/i)).not.toBeInTheDocument();
    expect(screen.queryByText('O también')).not.toBeInTheDocument();
  });

  it('shows short-password validation and blocks submission', async () => {
    const onRegister = vi.fn();

    render(<Register onRegister={onRegister} onNavigateToLogin={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Tu nombre completo'), {
      target: { value: 'Admin User' },
    });
    fireEvent.change(screen.getByPlaceholderText('admin@escuela.edu'), {
      target: { value: 'admin@example.edu' },
    });
    fireEvent.change(screen.getByPlaceholderText('Min 8 car.'), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'short' },
    });

    const form = screen.getByRole('button', { name: /crear cuenta/i }).closest('form');
    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Expected register form to be rendered');
    }
    fireEvent.submit(form);

    expect(
      await screen.findByText('La contraseña debe tener al menos 8 caracteres')
    ).toBeInTheDocument();
    expect(screen.getByText('Mínimo 8 caracteres')).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('shows mismatch validation and prevents submission', async () => {
    render(<Register onRegister={vi.fn()} onNavigateToLogin={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Tu nombre completo'), {
      target: { value: 'Admin User' },
    });
    fireEvent.change(screen.getByPlaceholderText('admin@escuela.edu'), {
      target: { value: 'admin@example.edu' },
    });
    fireEvent.change(screen.getByPlaceholderText('Min 8 car.'), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'Mismatch123!' },
    });

    const form = screen.getByRole('button', { name: /crear cuenta/i }).closest('form');
    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Expected register form to be rendered');
    }
    fireEvent.submit(form);

    expect(await screen.findAllByText('Las contraseñas no coinciden')).toHaveLength(2);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('submits a normalized payload and redirects after success', async () => {
    const onRegister = vi.fn();

    render(<Register onRegister={onRegister} onNavigateToLogin={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Tu nombre completo'), {
      target: { value: '  Ada Lovelace  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('admin@escuela.edu'), {
      target: { value: '  ADMIN@Example.EDU  ' },
    });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Administrador de Sistemas' },
    });
    fireEvent.change(screen.getByPlaceholderText('Min 8 car.'), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'Password123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        name: 'Ada Lovelace',
        email: 'admin@example.edu',
        password: 'Password123!',
      });
    });
    expect(
      await screen.findByText(/Cuenta creada exitosamente\. Redirigiendo al Panel\.\.\./i)
    ).toBeInTheDocument();

    await waitFor(
      () => {
        expect(onRegister).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 }
    );
  });

  it('surfaces registration API failures and reports them', async () => {
    const onRegister = vi.fn();
    mockRegister.mockRejectedValueOnce(new Error('Correo ya registrado'));

    render(<Register onRegister={onRegister} onNavigateToLogin={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Tu nombre completo'), {
      target: { value: 'Admin User' },
    });
    fireEvent.change(screen.getByPlaceholderText('admin@escuela.edu'), {
      target: { value: 'admin@example.edu' },
    });
    fireEvent.change(screen.getByPlaceholderText('Min 8 car.'), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'Password123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(await screen.findByText(/Correo ya registrado/i)).toBeInTheDocument();
    expect(mockReportError).toHaveBeenCalledWith('Failed to register user:', expect.any(Error));
    expect(onRegister).not.toHaveBeenCalled();
  });

  it('navigates back to the login screen when requested', () => {
    const onNavigateToLogin = vi.fn();

    render(<Register onRegister={vi.fn()} onNavigateToLogin={onNavigateToLogin} />);

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));

    expect(onNavigateToLogin).toHaveBeenCalledTimes(1);
  });
});
