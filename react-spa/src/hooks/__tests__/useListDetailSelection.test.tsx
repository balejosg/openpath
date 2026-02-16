import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { useListDetailSelection } from '../useListDetailSelection';

interface Item {
  id: string;
  name: string;
}

const A: Item = { id: 'a', name: 'A' };
const B: Item = { id: 'b', name: 'B' };

describe('useListDetailSelection', () => {
  it('auto-selects first item when list has entries', () => {
    const { result } = renderHook(() => useListDetailSelection([A, B]));

    expect(result.current.selectedId).toBe('a');
    expect(result.current.selectedItem?.id).toBe('a');
  });

  it('keeps selected item when still present in list', () => {
    const { result, rerender } = renderHook(({ items }) => useListDetailSelection(items), {
      initialProps: { items: [A, B] as Item[] },
    });

    act(() => {
      result.current.setSelectedId('b');
    });

    rerender({ items: [{ ...A, name: 'A updated' }, B] });

    expect(result.current.selectedId).toBe('b');
    expect(result.current.selectedItem?.id).toBe('b');
  });

  it('clears selection when filtered list becomes empty', () => {
    const { result, rerender } = renderHook(({ items }) => useListDetailSelection(items), {
      initialProps: { items: [A, B] as Item[] },
    });

    act(() => {
      result.current.setSelectedId('b');
    });

    rerender({ items: [] });

    expect(result.current.selectedId).toBeNull();
    expect(result.current.selectedItem).toBeNull();
  });

  it('does not auto-select when autoSelectFirst is disabled', () => {
    const { result } = renderHook(() => useListDetailSelection([A, B], { autoSelectFirst: false }));

    expect(result.current.selectedId).toBeNull();
    expect(result.current.selectedItem).toBeNull();
  });
});
