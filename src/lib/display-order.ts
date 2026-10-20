import { parseKey } from './layout';

/** Folder tiles show this many member images. */
export const MOSAIC = 4;

/**
 * Podcast ids in the order the Podcasts screen needs them. `keys` are the tiles as displayed (`p:`
 * / `f:`). First the tiles around `from` (a screenful: their art, and each folder's mosaic images),
 * then the tiles after them, then the tiles before, and finally the folder members that never
 * appear on a tile. Used to warm artwork, refresh feeds and fill in imported shows nearest the
 * viewport first, whatever order the shows were subscribed in.
 */
export function displayOrder(keys: string[], folderOrder: Record<string, string[]>, opts: { from?: number; count?: number } = {}): string[] {
  const from = Math.max(0, Math.min(keys.length, opts.from ?? 0));
  const count = opts.count ?? 18;
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  const addTile = (key: string) => {
    const { type, id } = parseKey(key);
    if (type === 'podcast') add(id);
    else for (const m of (folderOrder[id] ?? []).slice(0, MOSAIC)) add(m);
  };

  const order = [...keys.slice(from, from + count), ...keys.slice(from + count), ...keys.slice(0, from)];
  for (const key of order) addTile(key);
  for (const key of order) {
    const { type, id } = parseKey(key);
    if (type === 'folder') for (const m of (folderOrder[id] ?? []).slice(MOSAIC)) add(m);
  }
  return out;
}
