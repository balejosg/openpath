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
  isAdmin: () => true,
}));

describe('Groups view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mockUpdateGroup.mockRejectedValueOnce(new Error('BAD_REQUEST: groups.update 400'));

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
});
