import { useMemo } from 'react';

import type { Podcast } from '@/api/types';
import { unplayedCount } from '@/lib/episode-state';
import { tileKey } from '@/lib/layout';
import { useFeeds, type FeedEntry } from '@/store/feeds';
import { useLibrary } from '@/store/library';

// A feed that lands replaces only its own entry, so the other shows' counts are reused: recounting every episode of
// every show on each arrival is what made the grid stutter while a big library refreshed.
const counted = new WeakMap<FeedEntry, { version: number; n: number }>();

/** Derived, memoised views of the library for the Podcasts and folder screens. */
export function useLibraryView() {
  const subscriptions = useLibrary((s) => s.subscriptions);
  const folders = useLibrary((s) => s.folders);
  const folderOrder = useLibrary((s) => s.folderOrder);
  // Only changes when played/archived does, not on every progress save while something plays.
  const countsVersion = useLibrary((s) => s.countsVersion);
  const feeds = useFeeds((s) => s.feeds);

  return useMemo(() => {
    const states = useLibrary.getState().episodes;
    const unplayed: Record<string, number> = {};
    const latest: Record<string, number> = {};
    for (const id of Object.keys(subscriptions)) {
      const entry = feeds[id];
      const eps = entry?.episodes ?? [];
      let hit = entry ? counted.get(entry) : undefined;
      if (entry && (!hit || hit.version !== countsVersion)) {
        hit = { version: countsVersion, n: unplayedCount(id, eps, states) };
        counted.set(entry, hit);
      }
      unplayed[id] = hit?.n ?? 0;
      latest[id] = eps[0]?.published ?? 0;
    }
    const members = (folderId: string): Podcast[] =>
      (folderOrder[folderId] ?? []).flatMap((id) => (subscriptions[id] ? [subscriptions[id].podcast] : []));
    const folderUnplayed = (folderId: string) =>
      (folderOrder[folderId] ?? []).reduce((n, id) => n + (unplayed[id] ?? 0), 0);
    const folderLatest = (folderId: string) =>
      Math.max(0, ...(folderOrder[folderId] ?? []).map((id) => latest[id] ?? 0));
    return { subscriptions, folders, folderOrder, unplayed, latest, members, folderUnplayed, folderLatest, tileKey };
    // `countsVersion` stands in for the episode states (read above from the store).
  }, [subscriptions, folders, folderOrder, countsVersion, feeds]);
}
