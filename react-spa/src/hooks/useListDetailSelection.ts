import { useEffect, useMemo, useRef, useState } from 'react';

interface EntityWithId {
  id: string;
}

interface UseListDetailSelectionOptions {
  autoSelectFirst?: boolean;
  initialSelectedId?: string | null;
}

export function useListDetailSelection<T extends EntityWithId>(
  items: T[],
  options: UseListDetailSelectionOptions = {}
) {
  const { autoSelectFirst = true, initialSelectedId = null } = options;
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const pendingInitialSelectedIdRef = useRef<string | null>(initialSelectedId);

  useEffect(() => {
    if (items.length === 0) {
      if (selectedId !== null && pendingInitialSelectedIdRef.current === null) {
        setSelectedId(null);
      }
      return;
    }

    if (selectedId && items.some((item) => item.id === selectedId)) {
      pendingInitialSelectedIdRef.current = null;
      return;
    }

    if (
      pendingInitialSelectedIdRef.current &&
      items.some((item) => item.id === pendingInitialSelectedIdRef.current)
    ) {
      setSelectedId(pendingInitialSelectedIdRef.current);
      return;
    }

    pendingInitialSelectedIdRef.current = null;

    if (autoSelectFirst) {
      setSelectedId(items[0].id);
      return;
    }

    setSelectedId(null);
  }, [items, selectedId, autoSelectFirst]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  return {
    selectedId,
    selectedItem,
    setSelectedId,
  };
}
