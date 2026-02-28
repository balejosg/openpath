import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Groups from '../Groups';

let queryClient: QueryClient | null = null;

function renderGroups() {
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
      <Groups onNavigateToRules={vi.fn()} />
    </QueryClientProvider>
  );
}

afterEach(() => {
  queryClient?.clear();
  queryClient = null;
});

const mockListGroups = vi.fn();
const mockUpdateGroup = vi.fn();
const isAdminMock = vi.fn(() => true);
const isTeacherMock = vi.fn(() => false);
const teacherFlagMock = vi.fn(() => false);

vi.mock('../../lib/trpc', () => ({
  trpc: {
    groups: {
      list: { query: (): unknown => mockListGroups() },
      create: { mutate: vi.fn() },
      update: { mutate: (input: unknown): unknown => mockUpdateGroup(input) },
    },
  },
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({
    ToastContainer: () => null,
  }),
}));

vi.mock('../../lib/auth', () => ({
  isAdmin: () => isAdminMock(),
  isTeacher: () => isTeacherMock(),
  isTeacherGroupsFeatureEnabled: () => teacherFlagMock(),
}));

describe('Groups view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminMock.mockReturnValue(true);
    isTeacherMock.mockReturnValue(false);
    teacherFlagMock.mockReturnValue(false);
    mockListGroups.mockResolvedValue([
      {
        id: 'group-1',
        name: 'grupo-1',
        displayName: 'Grupo 1',
        whitelistCount: 2,
        blockedSubdomainCount: 1,
        blockedPathCount: 0,
        enabled: true,
      },
    ]);
  });

  it('shows actionable inline feedback when group configuration save fails with 400', async () => {
    mockUpdateGroup.mockRejectedValueOnce({ data: { code: 'BAD_REQUEST' } });

    renderGroups();

    await screen.findByText('grupo-1');
    fireEvent.click(screen.getByRole('button', { name: /configurar/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar Cambios' }));

    await waitFor(() => {
      expect(mockUpdateGroup).toHaveBeenCalled();
    });

    expect(
      await screen.findByText('Revisa los datos del grupo antes de guardar.')
    ).toBeInTheDocument();
  });

  it('does not show create CTA for teacher when feature flag is disabled', async () => {
    isAdminMock.mockReturnValue(false);
    isTeacherMock.mockReturnValue(true);
    teacherFlagMock.mockReturnValue(false);
    mockListGroups.mockResolvedValueOnce([]);

    renderGroups();

    expect(
      await screen.findByText(
        'Todavía no tienes políticas asignadas. Pide a un administrador que te asigne una.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\+\s*nuevo\s*grupo/i })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /\+\s*crear\s*mi\s*primera\s*política/i })
    ).toBeNull();
  });

  it('shows create CTA + updated empty-state for teacher when feature flag is enabled', async () => {
    isAdminMock.mockReturnValue(false);
    isTeacherMock.mockReturnValue(true);
    teacherFlagMock.mockReturnValue(true);
    mockListGroups.mockResolvedValueOnce([]);

    renderGroups();

    expect(
      await screen.findByText('Todavía no tienes políticas. Crea una nueva para empezar.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+\s*nuevo\s*grupo/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /\+\s*crear\s*mi\s*primera\s*política/i })
    ).toBeInTheDocument();
  });
});
