import { useEffect, useMemo, useState } from 'react';

interface EntityWithId {
  id: string;
}

interface UseListDetailSelectionOptions {
  autoSelectFirst?: boolean;
}

export function useListDetailSelection<T extends EntityWithId>(
  items: T[],
  options: UseListDetailSelectionOptions = {}
) {
  const { autoSelectFirst = true } = options;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      if (selectedId !== null) {
        setSelectedId(null);
      }
      return;
    }

    if (selectedId && items.some((item) => item.id === selectedId)) {
      return;
    }

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
