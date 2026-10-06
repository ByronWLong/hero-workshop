import { useEffect, useRef } from 'react';

/**
 * Opens a tab's edit form for one item when the editor is launched focused on it (e.g.
 * from an item in Foundry). Runs once per focus id, after the items are available.
 */
export function useFocusItem<T extends { id: string }>(
  focusItemId: string | undefined,
  items: T[],
  open: (item: T) => void,
): void {
  const opened = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!focusItemId || opened.current === focusItemId) return;
    const item = items.find((i) => i.id === focusItemId);
    if (!item) return;
    opened.current = focusItemId;
    open(item);
  });
}
