export type PodcastSort = 'custom' | 'name' | 'added' | 'recent';

export const SORT_LABELS: Record<PodcastSort, string> = {
  custom: 'Drag & drop order',
  name: 'Name (A–Z)',
  added: 'Date subscribed',
  recent: 'Latest episode',
};

export type SortableTile = { key: string; name: string; added: number; latest: number };

/** Returns tile keys in display order. `custom` keeps the stored order. */
export function sortTiles(tiles: SortableTile[], sort: PodcastSort): string[] {
  const list = [...tiles];
  if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  else if (sort === 'added') list.sort((a, b) => b.added - a.added);
  else if (sort === 'recent') list.sort((a, b) => b.latest - a.latest);
  return list.map((t) => t.key);
}
