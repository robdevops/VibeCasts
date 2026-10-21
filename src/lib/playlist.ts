import type { Episode, Podcast } from '@/api/types';

/** An episode saved in a playlist or the queue: enough to show and play it without its feed. */
export type EpisodeRef = {
  podcast: Pick<Podcast, 'id' | 'title' | 'author' | 'artwork' | 'feedUrl'> & Partial<Podcast>;
  episode: Omit<Episode, 'description'> & { description?: string };
};

export const refKey = (r: EpisodeRef) => `${r.podcast.id}|${r.episode.id}`;

export function toRef(episode: Episode, podcast: Podcast): EpisodeRef {
  const { description: _d, ...slim } = episode;
  return {
    podcast: { id: podcast.id, title: podcast.title, author: podcast.author, artwork: podcast.artwork, feedUrl: podcast.feedUrl },
    episode: slim,
  };
}

/** Back to full types for the player (show notes are looked up from the feed when needed). */
export function fromRef(r: EpisodeRef): { episode: Episode; podcast: Podcast } {
  return { episode: { description: '', ...r.episode }, podcast: r.podcast as Podcast };
}

/**
 * Add refs to a list without duplicates. `first` puts them at the front in the given order and
 * moves ones already present to the front; `last` appends only the ones not already there.
 */
export function addRefs(items: EpisodeRef[], add: EpisodeRef[], where: 'first' | 'last'): EpisodeRef[] {
  const incoming = add.filter((r, i) => add.findIndex((x) => refKey(x) === refKey(r)) === i);
  if (where === 'first') {
    const moving = new Set(incoming.map(refKey));
    return [...incoming, ...items.filter((r) => !moving.has(refKey(r)))];
  }
  const have = new Set(items.map(refKey));
  return [...items, ...incoming.filter((r) => !have.has(refKey(r)))];
}

export function removeRef(items: EpisodeRef[], key: string): EpisodeRef[] {
  return items.filter((r) => refKey(r) !== key);
}

/** Move the item at `from` to `to` (both clamped); out-of-range `from` changes nothing. */
export function moveRef<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items;
  const target = Math.min(items.length - 1, Math.max(0, to));
  if (target === from) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}
