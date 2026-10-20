import { useMemo } from 'react';

import type { Podcast } from '@/api/types';
import { unplayedCount } from '@/lib/episode-state';
import { tileKey } from '@/lib/layout';
import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';

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
      const eps = feeds[id]?.episodes ?? [];
      unplayed[id] = unplayedCount(id, eps, states);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptions, folders, folderOrder, countsVersion, feeds]);
}
