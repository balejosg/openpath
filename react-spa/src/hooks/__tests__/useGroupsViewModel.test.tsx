import { act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderHookWithQueryClient } from '../../test-utils/query';
import { useGroupsViewModel } from '../useGroupsViewModel';

const { mockLibraryList } = vi.hoisted(() => ({
  mockLibraryList: vi.fn(),
}));

vi.mock('../../lib/trpc', () => ({
  trpc: {
    groups: {
      libraryList: { query: mockLibraryList },
      create: { mutate: vi.fn() },
      update: { mutate: vi.fn() },
      clone: { mutate: vi.fn() },
    },
  },
}));

vi.mock('../../lib/auth', () => ({
  isAdmin: () => true,
  isTeacher: () => false,
  isTeacherGroupsFeatureEnabled: () => false,
}));

vi.mock('../useAllowedGroups', () => ({
  useAllowedGroups: () => ({
    groups: [
      {
        id: 'group-1',
        name: 'grupo-1',
        displayName: 'Grupo 1',
        whitelistCount: 1,
        blockedSubdomainCount: 0,
        blockedPathCount: 0,
        enabled: true,
        visibility: 'private',
      },
    ],
    groupById: new Map(),
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../useMutationFeedback', () => ({
  useMutationFeedback: () => ({
    error: '',
    clearError: vi.fn(),
    captureError: vi.fn(),
  }),
}));

vi.mock('../../lib/reportError', () => ({
  reportError: vi.fn(),
}));

describe('useGroupsViewModel', () => {
  it('loads library groups and opens clone modal with derived defaults', async () => {
    mockLibraryList.mockResolvedValueOnce([
      {
        id: 'library-1',
        name: 'biblioteca',
        displayName: 'Biblioteca',
        whitelistCount: 2,
        blockedSubdomainCount: 0,
        blockedPathCount: 0,
        enabled: true,
        visibility: 'instance_public',
      },
    ]);

    const { result } = renderHookWithQueryClient(() =>
      useGroupsViewModel({ onNavigateToRules: vi.fn() })
    );

    act(() => {
      result.current.setActiveView('library');
    });

    await waitFor(() => {
      expect(result.current.groups[0]?.id).toBe('library-1');
    });

    act(() => {
      result.current.openCloneModal('library-1');
    });

    expect(result.current.cloneSource?.id).toBe('library-1');
    expect(result.current.cloneName).toBe('biblioteca-copia');
    expect(result.current.cloneDisplayName).toBe('Biblioteca Copia');
  });
});
