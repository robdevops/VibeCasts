export type PodcastSort = 'custom' | 'name' | 'added' | 'recent';

export const SORT_LABELS: Record<PodcastSort, string> = {
  custom: 'Drag & drop order',
  name: 'Name (A–Z)',
  added: 'Date subscribed',
  recent: 'Latest episode',
};

// One collator for the whole sort: calling `localeCompare` with options builds a new one for every comparison.
let collator: Intl.Collator | undefined;
const byName = (a: string, b: string) => (collator ??= new Intl.Collator(undefined, { sensitivity: 'base' })).compare(a, b);

export type SortableTile = { key: string; name: string; added: number; latest: number };

/** Returns tile keys in display order. `custom` keeps the stored order. */
export function sortTiles(tiles: SortableTile[], sort: PodcastSort): string[] {
  // A tile can only appear once: a repeated key would leave a gap in the grid.
  const seen = new Set<string>();
  const list = tiles.filter((t) => !seen.has(t.key) && !!seen.add(t.key));
  if (sort === 'name') list.sort((a, b) => byName(a.name, b.name));
  else if (sort === 'added') list.sort((a, b) => b.added - a.added);
  else if (sort === 'recent') list.sort((a, b) => b.latest - a.latest);
  return list.map((t) => t.key);
}
