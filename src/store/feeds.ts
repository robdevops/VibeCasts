import { create } from 'zustand';

import { fetchFeedConditional, FeedNotModified, type FeedValidators } from '@/api/feed-fetch';
import { parseFeed } from '@/api/rss';
import type { Episode, ParsedFeed, Podcast } from '@/api/types';
import { kv } from '@/db/kv';
import { useLibrary } from './library';
import type { KV } from '@/db/storage';
import { createWriter } from '@/db/writer';

/** Newest episodes kept per show in the persisted cache. */
const MAX_CACHED = 50;
const STORAGE_KEY = 'feeds.v1';
export const STALE_MS = 30 * 60 * 1000;

export type FeedEntry = { fetchedAt: number; total: number; episodes: Episode[]; validators?: FeedValidators };

/** Show details read from the feed itself. */
export type FeedMeta = { title?: string; description?: string; website?: string; category?: string; author?: string; artwork?: string };

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
  /** Store an already-parsed feed (used when the feed was just fetched for another reason). */
  ingest(podcast: Podcast, parsed: ParsedFeed, validators?: FeedValidators): void;
  /** `conditional`: send the saved validators and skip the work if the feed hasn't changed (bulk and background refreshes). */
  refresh(podcast: Podcast, opts?: { conditional?: boolean }): Promise<void>;
  refreshAll(podcasts: Podcast[], opts?: { onlyStale?: boolean }): Promise<void>;
  /** Fetch details for shows added from a file (3 at a time), reporting progress for a banner. */
  backfill(podcasts: Podcast[]): Promise<void>;
  /** Null when no backfill is running. */
  backfillProgress: { done: number; total: number } | null;
};

/** Persisted copy without show notes (the biggest part of a feed); they come back with the next fetch. */
const slimmed = new WeakMap<FeedEntry, FeedEntry>();
function slim(feeds: Record<string, FeedEntry>): Record<string, FeedEntry> {
  const out: Record<string, FeedEntry> = {};
  for (const [id, f] of Object.entries(feeds)) {
    // Entries are replaced, never edited, so an unchanged feed reuses its slimmed copy.
    let copy = slimmed.get(f);
    if (!copy) {
      copy = { ...f, episodes: f.episodes.map(({ description: _d, ...e }) => e as Episode) };
      slimmed.set(f, copy);
    }
    out[id] = copy;
  }
  return out;
}

/** Fetches a feed. May return just the XML, or the XML with its validators; throws `FeedNotModified` for an unchanged feed. */
export type FetchText = (url: string, validators?: FeedValidators) => Promise<string | { text: string; validators?: FeedValidators }>;

export function createFeedStore(
  storage: KV = kv,
  fetchText: FetchText = fetchFeedConditional,
  /** Called with a show's own details after each successful fetch (fills in imported shows). */
  onMeta: (podcastId: string, meta: FeedMeta) => void = () => {},
) {
  const store = create<FeedData & Actions>()((set, get) => ({
    feeds: {},
    known: {},
    loading: {},
    full: {},
    hydrated: false,
    backfillProgress: null,

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

    ingest(podcast, parsed, validators) {
      const sorted = parsed.episodes
        .map((e) => ({ ...e, podcastId: podcast.id }))
        .sort((a, b) => b.published - a.published);
      set((s) => ({
        feeds: {
          ...s.feeds,
          [podcast.id]: { fetchedAt: Date.now(), total: sorted.length, episodes: sorted.slice(0, MAX_CACHED), validators },
        },
        full: { ...s.full, [podcast.id]: { episodes: sorted, meta: parsed.podcast } },
      }));
      onMeta(podcast.id, parsed.podcast);
    },

    async refresh(podcast, opts) {
      if (!podcast.feedUrl || get().loading[podcast.id]) return;
      set((s) => ({ loading: { ...s.loading, [podcast.id]: true } }));
      try {
        const res = await fetchText(podcast.feedUrl, opts?.conditional ? get().feeds[podcast.id]?.validators : undefined);
        const text = typeof res === 'string' ? res : res.text;
        get().ingest(podcast, parseFeed(text), typeof res === 'string' ? undefined : res.validators);
      } catch (e) {
        if (e instanceof FeedNotModified) {
          // Nothing new: keep the cache, and count it as fresh so it isn't asked again right away.
          set((s) => {
            const entry = s.feeds[podcast.id];
            return entry ? { feeds: { ...s.feeds, [podcast.id]: { ...entry, fetchedAt: Date.now() } } } : s;
          });
        }
        // Otherwise keep whatever we had cached; the UI shows stale data rather than an error per tile.
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
        await Promise.all(todo.slice(i, i + 4).map((p) => get().refresh(p, { conditional: true })));
      }
    },

    async backfill(podcasts) {
      if (get().backfillProgress) return;
      const todo = podcasts.filter((p) => p.needsMeta && p.feedUrl);
      if (!todo.length) return;
      set({ backfillProgress: { done: 0, total: todo.length } });
      let next = 0;
      const worker = async () => {
        while (next < todo.length) {
          const p = todo[next++];
          await get().refresh(p);
          set((s) => ({ backfillProgress: s.backfillProgress && { ...s.backfillProgress, done: s.backfillProgress.done + 1 } }));
          // Let the UI breathe between big XML parses.
          await new Promise((r) => setTimeout(r, 0));
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      set({ backfillProgress: null });
    },
  }));

  // A refresh of every feed changes this store dozens of times; write it in one go afterwards.
  const writer = createWriter(storage, STORAGE_KEY);
  store.subscribe((s, prev) => {
    if (!s.hydrated || (s.feeds === prev.feeds && s.known === prev.known)) return;
    writer.schedule(() => JSON.stringify({ feeds: slim(s.feeds), known: s.known }), 3000);
  });

  return store;
}

export const useFeeds = createFeedStore(kv, fetchFeedConditional, (id, meta) => useLibrary.getState().mergePodcastMeta(id, meta));
