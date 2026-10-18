export type TileRef = { type: 'podcast' | 'folder'; id: string };

export const tileKey = (t: TileRef) => `${t.type === 'podcast' ? 'p' : 'f'}:${t.id}`;

/** Move `from` to the slot currently occupied by `to`. */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
