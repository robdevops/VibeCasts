import { create } from 'zustand';

import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';
import type { EpisodeRef } from '@/lib/playlist';

export type Bookmark = {
  id: string;
  podcastId: string;
  episodeId: string;
  /** Position in the episode, seconds. */
  timeSec: number;
  createdAt: number;
  /** The episode and show, saved so the bookmark can be listed and played without the show's feed. */
  ref?: EpisodeRef;
};

type Actions = {
  items: Bookmark[];
  hydrated: boolean;
  hydrate(): Promise<void>;
  add(podcastId: string, episodeId: string, timeSec: number, ref?: EpisodeRef): Bookmark;
  /** Save the episode details on bookmarks that were made before they were kept (one update). */
  attachRefs(refs: Record<string, EpisodeRef>): void;
  remove(id: string): void;
};

const STORAGE_KEY = 'bookmarks.v1';

export function createBookmarkStore(storage: KV = kv) {
  const store = create<Actions>()((set, get) => ({
    items: [],
    hydrated: false,
    async hydrate() {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        if (raw) set({ items: JSON.parse(raw) as Bookmark[] });
      } catch {
        // Start empty.
      }
      set({ hydrated: true });
    },
    add(podcastId, episodeId, timeSec, ref) {
      const rounded = Math.round(timeSec);
      // Two taps at the same second shouldn't make two identical bookmarks.
      const existing = get().items.find((b) => b.podcastId === podcastId && b.episodeId === episodeId && b.timeSec === rounded);
      if (existing) return existing;
      const bookmark: Bookmark = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        podcastId,
        episodeId,
        timeSec: rounded,
        createdAt: Date.now(),
        ref,
      };
      set((s) => ({ items: [...s.items, bookmark] }));
      return bookmark;
    },
    attachRefs(refs) {
      set((s) => (s.items.some((b) => !b.ref && refs[b.id]) ? { items: s.items.map((b) => (!b.ref && refs[b.id] ? { ...b, ref: refs[b.id] } : b)) } : s));
    },
    remove: (id) => set((s) => ({ items: s.items.filter((b) => b.id !== id) })),
  }));

  store.subscribe((s, prev) => {
    if (!s.hydrated || s.items === prev.items) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(s.items)).catch(() => {});
  });
  return store;
}

export const useBookmarks = createBookmarkStore();

export const bookmarksForEpisode = (items: Bookmark[], podcastId: string, episodeId: string) =>
  items.filter((b) => b.podcastId === podcastId && b.episodeId === episodeId).sort((a, b) => a.timeSec - b.timeSec);
