import { create } from 'zustand';

import { feedFetchUrl } from '@/api/itunes';
import { parseFeed } from '@/api/rss';
import type { Episode, Podcast } from '@/api/types';
import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';

/** Newest episodes kept per show in the persisted cache. */
const MAX_CACHED = 100;
const STORAGE_KEY = 'feeds.v1';
export const STALE_MS = 30 * 60 * 1000;

export type FeedEntry = { fetchedAt: number; total: number; episodes: Episode[] };

/** Show details read from the feed itself. */
export type FeedMeta = { description?: string; website?: string; category?: string; author?: string; artwork?: string };

/** Whole feed, held in memory only for the current session. */
export type FullFeed = { episodes: Episode[]; meta: FeedMeta };

type FeedData = {
  feeds: Record<string, FeedEntry>;
  /** Podcasts seen in search/discovery, so a preview page can open from just an id. */
  known: Record<string, Podcast>;
};
type Actions = {
  hydrated: boolean;
  loading: Record<string, true>;
  full: Record<string, FullFeed>;
  hydrate(): Promise<void>;
  remember(p: Podcast): void;
  refresh(podcast: Podcast): Promise<void>;
  refreshAll(podcasts: Podcast[], opts?: { onlyStale?: boolean }): Promise<void>;
};

export type FetchText = (url: string) => Promise<string>;

const defaultFetch: FetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Feed request failed (${res.status})`);
  return res.text();
};

export function createFeedStore(storage: KV = kv, fetchText: FetchText = defaultFetch) {
  const store = create<FeedData & Actions>()((set, get) => ({
    feeds: {},
    known: {},
    loading: {},
    full: {},
    hydrated: false,

    remember(p) {
      if (get().known[p.id]?.feedUrl === p.feedUrl && get().known[p.id]?.title === p.title) return;
      set((s) => ({ known: { ...s.known, [p.id]: p } }));
    },

    async hydrate() {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw) as Partial<FeedData>;
          set({ feeds: data.feeds ?? {}, known: data.known ?? {} });
        }
      } catch {
        // Unreadable cache: refetch instead.
      }
      set({ hydrated: true });
    },

    async refresh(podcast) {
      if (!podcast.feedUrl || get().loading[podcast.id]) return;
      set((s) => ({ loading: { ...s.loading, [podcast.id]: true } }));
      try {
        const parsed = parseFeed(await fetchText(feedFetchUrl(podcast.feedUrl)));
        const sorted = parsed.episodes
          .map((e) => ({ ...e, podcastId: podcast.id }))
          .sort((a, b) => b.published - a.published);
        set((s) => ({
          feeds: {
            ...s.feeds,
            [podcast.id]: { fetchedAt: Date.now(), total: sorted.length, episodes: sorted.slice(0, MAX_CACHED) },
          },
          full: { ...s.full, [podcast.id]: { episodes: sorted, meta: parsed.podcast } },
        }));
      } catch {
        // Keep whatever we had cached; the UI shows stale data rather than an error per tile.
      } finally {
        set((s) => {
          const { [podcast.id]: _done, ...loading } = s.loading;
          return { loading };
        });
      }
    },

    async refreshAll(podcasts, opts) {
      const now = Date.now();
      const todo = podcasts.filter((p) => !opts?.onlyStale || now - (get().feeds[p.id]?.fetchedAt ?? 0) > STALE_MS);
      for (let i = 0; i < todo.length; i += 4) {
        await Promise.all(todo.slice(i, i + 4).map((p) => get().refresh(p)));
      }
    },
  }));

  let timer: ReturnType<typeof setTimeout> | undefined;
  store.subscribe((s, prev) => {
    if (!s.hydrated || (s.feeds === prev.feeds && s.known === prev.known)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      storage.setItem(STORAGE_KEY, JSON.stringify({ feeds: s.feeds, known: s.known })).catch(() => {});
    }, 500);
  });

  return store;
}

export const useFeeds = createFeedStore();
