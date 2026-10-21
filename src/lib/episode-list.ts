import type { Episode } from '@/api/types';

import { episodeKey, type EpisodeState } from './episode-state';

export type EpisodeSort = 'newest' | 'oldest';

export type EpisodeFilter = { query: string; showArchived: boolean; sort: EpisodeSort };

type States = Record<string, EpisodeState | undefined>;

/** Episodes for the podcast page: filtered as you type, archived hidden unless asked for. */
export function visibleEpisodes(
  podcastId: string,
  episodes: readonly Episode[],
  states: States,
  { query, showArchived, sort }: EpisodeFilter,
): Episode[] {
  const q = query.trim().toLowerCase();
  const out = episodes.filter((e) => {
    if (!showArchived && states[episodeKey(podcastId, e.id)]?.archived) return false;
    return !q || e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q);
  });
  return out.sort((a, b) => (sort === 'newest' ? b.published - a.published : a.published - b.published));
}

export function episodeCounts(podcastId: string, episodes: readonly Episode[], states: States) {
  let archived = 0;
  for (const e of episodes) if (states[episodeKey(podcastId, e.id)]?.archived) archived++;
  return { total: episodes.length, archived };
}

/** Uppercase day-month label such as "16 OCTOBER", with the year only when it isn't this year. */
export function episodeDateLabel(published: number, now = Date.now()): string {
  if (!published) return '';
  const d = new Date(published);
  const month = d.toLocaleString('en-GB', { month: 'long' }).toUpperCase();
  const base = `${d.getDate()} ${month}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function durationLabel(durationSec: number): string {
  if (durationSec <= 0) return '';
  const m = Math.round(durationSec / 60);
  if (m < 60) return `${Math.max(m, 1)}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
