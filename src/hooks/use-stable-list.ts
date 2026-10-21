import { useState } from 'react';

import { sameList } from '@/lib/same-list';

/**
 * Returns the previous array while the new one holds the same items, so a recomputed but unchanged list does not
 * look like a change to everything below it (the grid, its callbacks and effects).
 */
export function useStableList<T>(next: readonly T[]): readonly T[] {
  const [current, setCurrent] = useState(next);
  if (sameList(current, next)) return current;
  setCurrent(next);
  return next;
}
