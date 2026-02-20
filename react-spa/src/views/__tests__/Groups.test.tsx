import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Groups from '../Groups';

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
  getTeacherGroups: () => ['group-1'],
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

    render(<Groups onNavigateToRules={vi.fn()} />);

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
