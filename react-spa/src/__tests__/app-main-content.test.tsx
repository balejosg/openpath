import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppMainContent, { getTitleForTab } from '../app-main-content';

vi.mock('../views/Dashboard', () => ({
  default: () => <div>Dashboard view</div>,
}));

vi.mock('../views/TeacherDashboard', () => ({
  default: () => <div>Teacher dashboard view</div>,
}));

vi.mock('../views/Classrooms', () => ({
  default: ({ initialSelectedClassroomId }: { initialSelectedClassroomId?: string | null }) => (
    <div>Classrooms view {initialSelectedClassroomId ?? 'none'}</div>
  ),
}));

vi.mock('../views/Groups', () => ({
  default: () => <div>Groups view</div>,
}));

vi.mock('../views/Users', () => ({
  default: () => <div>Users view</div>,
}));

vi.mock('../views/Settings', () => ({
  default: () => <div>Settings view</div>,
}));

vi.mock('../views/DomainRequests', () => ({
  default: () => <div>Domains view</div>,
}));

vi.mock('../views/RulesManager', () => ({
  default: ({ groupName }: { groupName: string }) => <div>Rules view {groupName}</div>,
}));

describe('app-main-content', () => {
  const baseProps = {
    activeTab: 'dashboard',
    admin: true,
    pendingSelectedClassroomId: null as string | null,
    selectedGroup: null,
    onBackFromRules: vi.fn(),
    onInitialSelectedClassroomIdConsumed: vi.fn(),
    onNavigateToClassroom: vi.fn(),
    onNavigateToRules: vi.fn(),
  };

  it('returns the expected section titles', () => {
    expect(getTitleForTab('dashboard', true, null)).toBe('Vista General');
    expect(getTitleForTab('dashboard', false, null)).toBe('Mi Panel');
    expect(getTitleForTab('classrooms', true, null)).toBe('Gestión de Aulas');
    expect(getTitleForTab('groups', false, null)).toBe('Mis Políticas');
    expect(getTitleForTab('rules', true, { id: 'g1', name: 'Grupo 1' })).toBe('Reglas: Grupo 1');
    expect(getTitleForTab('users', false, null)).toBe('Mi Panel');
    expect(getTitleForTab('domains', true, null)).toBe('Solicitudes de Acceso');
    expect(getTitleForTab('settings', true, null)).toBe('Configuración');
    expect(getTitleForTab('unknown', true, null)).toBe('OpenPath');
  });

  it('renders admin dashboard, classrooms, rules and settings tabs', () => {
    const { rerender } = render(<AppMainContent {...baseProps} />);
    expect(screen.getByText('Dashboard view')).toBeInTheDocument();

    rerender(
      <AppMainContent
        {...baseProps}
        activeTab="classrooms"
        pendingSelectedClassroomId="classroom-7"
      />
    );
    expect(screen.getByText('Classrooms view classroom-7')).toBeInTheDocument();

    rerender(
      <AppMainContent
        {...baseProps}
        activeTab="rules"
        selectedGroup={{ id: 'group-1', name: 'Grupo 1' }}
      />
    );
    expect(screen.getByText('Rules view Grupo 1')).toBeInTheDocument();

    rerender(<AppMainContent {...baseProps} activeTab="settings" />);
    expect(screen.getByText('Settings view')).toBeInTheDocument();
  });

  it('falls back to teacher content for restricted tabs when not admin', () => {
    const { rerender } = render(<AppMainContent {...baseProps} admin={false} activeTab="users" />);
    expect(screen.getByText('Teacher dashboard view')).toBeInTheDocument();

    rerender(<AppMainContent {...baseProps} admin={false} activeTab="domains" />);
    expect(screen.getByText('Teacher dashboard view')).toBeInTheDocument();

    rerender(<AppMainContent {...baseProps} admin={false} activeTab="dashboard" />);
    expect(screen.getByText('Teacher dashboard view')).toBeInTheDocument();
  });

  it('falls back to groups when rules tab has no selected group', () => {
    render(<AppMainContent {...baseProps} activeTab="rules" selectedGroup={null} />);
    expect(screen.getByText('Groups view')).toBeInTheDocument();
  });
});
