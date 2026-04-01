import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDomainRequestsState } from '../useDomainRequestsState';

const requests = [
  {
    id: 'req-1',
    domain: 'example.com',
    reason: 'Necesario para clase',
    requesterEmail: 'teacher@example.com',
    machineHostname: 'host-1',
    groupId: 'group-1',
    status: 'pending',
    source: 'manual',
    originHost: null,
    clientVersion: null,
    errorType: null,
    createdAt: '2026-04-01T10:00:00.000Z',
    updatedAt: '2026-04-01T10:00:00.000Z',
    resolvedAt: null,
    resolvedBy: null,
  },
  {
    id: 'req-2',
    domain: 'firefox.example.com',
    reason: 'Extensión',
    requesterEmail: 'teacher@example.com',
    machineHostname: 'host-2',
    groupId: 'group-2',
    status: 'approved',
    source: 'firefox-extension',
    originHost: null,
    clientVersion: null,
    errorType: null,
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    resolvedAt: null,
    resolvedBy: null,
  },
] as const;

describe('useDomainRequestsState', () => {
  it('filters by search and manages bulk selection for pending requests', () => {
    const { result } = renderHook(() =>
      useDomainRequestsState({
        requests: [...requests],
        groups: [
          { id: 'group-1', name: 'Grupo 1', path: 'group-1' },
          { id: 'group-2', name: 'Grupo 2', path: 'group-2' },
        ],
        statusFilter: 'all',
      })
    );

    act(() => {
      result.current.setSearchTerm('example.com');
    });

    expect(result.current.filteredRequests).toHaveLength(2);

    act(() => {
      result.current.toggleSelectAllInPage();
    });

    expect(result.current.selectedRequestIds).toEqual(['req-1']);
    expect(result.current.getGroupName('group-2')).toBe('Grupo 2');
  });
});
