import { create } from 'zustand';

import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';

export type Bookmark = {
  id: string;
  podcastId: string;
  episodeId: string;
  /** Position in the episode, seconds. */
  timeSec: number;
  createdAt: number;
};

type Actions = {
  items: Bookmark[];
  hydrated: boolean;
  hydrate(): Promise<void>;
  add(podcastId: string, episodeId: string, timeSec: number): Bookmark;
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
    add(podcastId, episodeId, timeSec) {
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
      };
      set((s) => ({ items: [...s.items, bookmark] }));
      return bookmark;
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
