import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from '../Sidebar';
import { logout } from '../../lib/auth';

vi.mock('../../lib/auth', () => ({
  logout: vi.fn(),
  isAdmin: () => true,
}));

describe('Sidebar', () => {
  const setActiveTab = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks selected navigation item as current page', () => {
    render(<Sidebar activeTab="dashboard" setActiveTab={setActiveTab} isOpen />);

    expect(screen.getByRole('button', { name: 'Panel de Control' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('maps rules view to group navigation active state', () => {
    render(<Sidebar activeTab="rules" setActiveTab={setActiveTab} isOpen />);

    expect(screen.getByRole('button', { name: 'Políticas de Grupo' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('marks settings button as current page when active', () => {
    render(<Sidebar activeTab="settings" setActiveTab={setActiveTab} isOpen />);

    expect(screen.getByRole('button', { name: 'Configuración' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('calls setActiveTab for navigation buttons', () => {
    render(<Sidebar activeTab="dashboard" setActiveTab={setActiveTab} isOpen />);

    fireEvent.click(screen.getByRole('button', { name: 'Aulas Seguras' }));
    expect(setActiveTab).toHaveBeenCalledWith('classrooms');
  });

  it('calls logout when close session is clicked', () => {
    render(<Sidebar activeTab="dashboard" setActiveTab={setActiveTab} isOpen />);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar Sesión' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
