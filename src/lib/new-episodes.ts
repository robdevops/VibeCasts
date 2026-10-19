import type { Episode } from '@/api/types';

/** How many episode ids to remember per podcast (a feed's newest handful is all that matters). */
export const SEEN_LIMIT = 100;

/**
 * Which episodes are new since last time? `seen` is what we already knew about; undefined means
 * this podcast was never checked, so everything current becomes the baseline and nothing is
 * announced (turning notifications on must not announce the whole back catalogue).
 */
export function findNewEpisodes(episodes: Episode[], seen: string[] | undefined): { fresh: Episode[]; seen: string[] } {
  const ids = episodes.map((e) => e.id);
  if (seen === undefined) return { fresh: [], seen: ids.slice(0, SEEN_LIMIT) };
  const known = new Set(seen);
  const fresh = episodes.filter((e) => !known.has(e.id));
  return { fresh, seen: [...fresh.map((e) => e.id), ...seen].slice(0, SEEN_LIMIT) };
}

/** Notification text for a podcast's new episodes (newest first). */
export function notificationText(podcastTitle: string, fresh: Episode[]): { title: string; body: string } {
  if (fresh.length === 1) return { title: podcastTitle, body: fresh[0].title };
  return { title: podcastTitle, body: `${fresh.length} new episodes: ${fresh[0].title}` };
}
