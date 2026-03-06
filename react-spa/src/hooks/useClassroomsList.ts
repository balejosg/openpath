import { useCallback, useEffect, useRef, useState } from 'react';

import {
  toClassroomControlStatesFromModels,
  toClassroomListModels,
  toClassroomsFromModels,
  type ClassroomControlState,
  type ClassroomListModel,
} from '../lib/classrooms';
import { trpc } from '../lib/trpc';
import { reportError } from '../lib/reportError';
import type { Classroom } from '../types';
import { useIntervalRefetch, useRefetchOnFocus } from './useLiveRefetch';

export const CLASSROOMS_LIST_QUERY_KEY = ['classrooms.list'] as const;

interface UseClassroomsListQueryOptions<TResult> {
  select: (items: readonly ClassroomListModel[]) => TResult;
  emptyValue: TResult;
  refetchIntervalMs?: number | false;
  refetchOnWindowFocus?: boolean;
}

interface UseClassroomsListQueryResult<TResult> {
  data: TResult;
  hasData: boolean;
  loading: boolean;
  fetching: boolean;
  error: string | null;
  refetchClassrooms: () => Promise<TResult>;
}

function useClassroomsListQuery<TResult>(
  options: UseClassroomsListQueryOptions<TResult>
): UseClassroomsListQueryResult<TResult> {
  const { select, emptyValue, refetchIntervalMs = false, refetchOnWindowFocus = false } = options;
  const [data, setData] = useState<TResult>(emptyValue);
  const [hasData, setHasData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestDataRef = useRef(data);
  const hasDataRef = useRef(false);
  latestDataRef.current = data;

  const fetchClassrooms = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      if (mode === 'initial') {
        setLoading(true);
      } else {
        setFetching(true);
      }

      try {
        const items = await trpc.classrooms.list.query();
        const nextData = select(toClassroomListModels(items));
        setData(nextData);
        setHasData(true);
        hasDataRef.current = true;
        setError(null);
        return nextData;
      } catch (err) {
        reportError('Failed to fetch classrooms:', err);
        setError('Error al cargar aulas');
        return hasDataRef.current ? latestDataRef.current : emptyValue;
      } finally {
        setLoading(false);
        setFetching(false);
      }
    },
    [emptyValue, select]
  );

  useEffect(() => {
    void fetchClassrooms('initial');
  }, [fetchClassrooms]);

  const refreshClassrooms = useCallback(() => {
    void fetchClassrooms();
  }, [fetchClassrooms]);

  useIntervalRefetch(
    refreshClassrooms,
    typeof refetchIntervalMs === 'number' ? refetchIntervalMs : 0,
    {
      enabled: typeof refetchIntervalMs === 'number',
    }
  );
  useRefetchOnFocus(refreshClassrooms, { enabled: refetchOnWindowFocus });

  return {
    data,
    hasData,
    loading,
    fetching,
    error,
    refetchClassrooms: fetchClassrooms,
  };
}

const EMPTY_CLASSROOMS: Classroom[] = [];
const EMPTY_CLASSROOM_CONTROL_STATES: ClassroomControlState[] = [];

export function useClassroomsQuery(options?: {
  refetchIntervalMs?: number | false;
  refetchOnWindowFocus?: boolean;
}): UseClassroomsListQueryResult<Classroom[]> {
  return useClassroomsListQuery({
    select: toClassroomsFromModels,
    emptyValue: EMPTY_CLASSROOMS,
    refetchIntervalMs: options?.refetchIntervalMs,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
}

export function useClassroomControlStatesQuery(options?: {
  refetchIntervalMs?: number | false;
  refetchOnWindowFocus?: boolean;
}): UseClassroomsListQueryResult<ClassroomControlState[]> {
  return useClassroomsListQuery({
    select: toClassroomControlStatesFromModels,
    emptyValue: EMPTY_CLASSROOM_CONTROL_STATES,
    refetchIntervalMs: options?.refetchIntervalMs,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
}
