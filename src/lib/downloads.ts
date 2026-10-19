import type { Episode } from '@/api/types';

import { episodeKey, type EpisodeState } from './episode-state';

export type ArchiveRule = 'never' | 'played' | '24h' | '2d' | '1w';

export const ARCHIVE_LABELS: Record<ArchiveRule, string> = {
  never: 'Never',
  played: 'After playing',
  '24h': 'After 24 hours',
  '2d': 'After 2 days',
  '1w': 'After 1 week',
};

const HOUR = 3_600_000;
const ARCHIVE_AFTER_MS: Record<Exclude<ArchiveRule, 'never' | 'played'>, number> = {
  '24h': 24 * HOUR,
  '2d': 48 * HOUR,
  '1w': 168 * HOUR,
};

/** Should this episode be archived now? Only played episodes are ever archived automatically. */
export function shouldAutoArchive(state: EpisodeState | undefined, now: number, rule: ArchiveRule, includeStarred: boolean): boolean {
  if (!state || rule === 'never' || state.archived || !state.played) return false;
  if (state.starred && !includeStarred) return false;
  if (rule === 'played') return true;
  const since = state.playedAt ?? state.lastPlayed;
  return since !== undefined && now - since >= ARCHIVE_AFTER_MS[rule];
}

export type NetworkRule = 'any' | 'wifi' | 'unmetered';

export const NETWORK_LABELS: Record<NetworkRule, string> = {
  any: 'Any connection',
  wifi: 'Wi-Fi only',
  unmetered: 'Unmetered connections only',
};

export type Conditions = {
  charging: boolean;
  connection: 'wifi' | 'cellular' | 'other' | 'none';
  /** The carrier or hotspot bills by data (netinfo `isConnectionExpensive`). */
  metered: boolean;
};

/** Do the device's current conditions allow an automatic download? */
export function downloadAllowed(rules: { onlyWhenCharging: boolean; network: NetworkRule }, c: Conditions): boolean {
  if (c.connection === 'none') return false;
  if (rules.onlyWhenCharging && !c.charging) return false;
  if (rules.network === 'wifi') return c.connection === 'wifi';
  if (rules.network === 'unmetered') return !c.metered;
  return true;
}

export type AutoDownloadPlan = { download: Episode[]; remove: Episode[] };

/**
 * Keep the newest `limit` unplayed episodes of a show downloaded. New ones are fetched; ones that
 * were fetched automatically and have fallen out of that window are removed (the oldest rotates
 * off). Downloads the user chose themselves, starred episodes and the ones being kept are never
 * removed.
 */
export function planAutoDownloads(args: {
  podcastId: string;
  /** Newest first. */
  episodes: Episode[];
  states: Record<string, EpisodeState>;
  limit: number;
}): AutoDownloadPlan {
  const { podcastId, episodes, states, limit } = args;
  const stateOf = (e: Episode) => states[episodeKey(podcastId, e.id)];
  const wanted = episodes.filter((e) => e.audioUrl && !stateOf(e)?.played && !stateOf(e)?.archived).slice(0, Math.max(0, limit));
  const keep = new Set(wanted.map((e) => e.id));
  return {
    download: wanted.filter((e) => !stateOf(e)?.downloadedUri),
    remove: episodes.filter((e) => {
      const s = stateOf(e);
      return !!s?.downloadedUri && !!s.autoDownloaded && !s.starred && !keep.has(e.id);
    }),
  };
}
