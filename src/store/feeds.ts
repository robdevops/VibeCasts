import { create } from 'zustand';

import { fetchFeedConditional, FeedNotModified, type FeedValidators } from '@/api/feed-fetch';
import { parseFeed } from '@/api/rss';
import type { Episode, ParsedFeed, Podcast } from '@/api/types';
import { kv } from '@/db/kv';
import { useLibrary } from './library';
import type { KV } from '@/db/storage';
import { createWriter } from '@/db/writer';

/** Newest episodes kept per show in the persisted cache. */
const MAX_CACHED = 20;
/** Whole feeds (with show notes) kept in memory: the most recently fetched or opened few, not every show. */
const MAX_FULL = 6;
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
  /** Keep this show's whole feed in memory while a screen is using it (it is not evicted until released). Returns the release. */
  pinFull(podcastId: string): () => void;
  /** Resolves once no backfill is running (a new one started while another runs would return at once). */
  backfillIdle(): Promise<void>;
  /** Store an already-parsed feed (used when the feed was just fetched for another reason). */
  ingest(podcast: Podcast, parsed: ParsedFeed, validators?: FeedValidators, opts?: { keepFull?: boolean }): void;
  /** `conditional`: send the saved validators and skip the work if the feed hasn't changed (bulk and background refreshes). */
  refresh(podcast: Podcast, opts?: { conditional?: boolean; keepFull?: boolean }): Promise<void>;
  /**
   * Refresh several feeds, 4 at a time, nearest the viewport first (see `setPriority`).
   * `whileLooking`: pause while nobody is looking at the library (phone locked, another tab) and carry on when they are.
   */
  refreshAll(podcasts: Podcast[], opts?: { onlyStale?: boolean; whileLooking?: boolean }): Promise<void>;
  /** Fetch details for shows added from a file (3 at a time), reporting progress for a banner. */
  backfill(podcasts: Podcast[], opts?: { whileLooking?: boolean; need?: (p: Podcast) => boolean; label?: string }): Promise<void>;
  /** The podcast ids in the order the screen wants them, most wanted first (asked again before every pick). */
  setPriority(ids: string[]): void;
  /** Is the Podcasts screen on screen with the phone unlocked? Bulk work started with `whileLooking` waits for this. */
  looking: boolean;
  setLooking(looking: boolean): void;
  /** Null when no backfill is running. */
  backfillProgress: { done: number; total: number; label?: string } | null;
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
  // Where each podcast sits in the order the screen wants them (lower = sooner).
  let rank = new Map<string, number>();
  const rankOf = (p: Podcast) => rank.get(p.id) ?? Number.MAX_SAFE_INTEGER;
  /** Remove and return the most wanted pending podcast (the order is re-read on every pick, so scrolling re-prioritises). */
  const takeNext = (pending: Podcast[]): Podcast | undefined => {
    let best = -1;
    for (let i = 0; i < pending.length; i++) {
      if (best < 0 || rankOf(pending[i]) < rankOf(pending[best])) best = i;
    }
    return best < 0 ? undefined : pending.splice(best, 1)[0];
  };
  // Whole feeds in memory, oldest first. Kept as an array because object keys that look like integers (iTunes ids)
  // enumerate in numeric order, not insertion order, which evicted the wrong show.
  const fullOrder: string[] = [];
  const pins = new Map<string, number>(); // shows a mounted screen is using: never evicted
  // Shows whose whole feed was asked for while a bulk fetch of the same show (which keeps only the newest episodes) was in flight.
  const wantFull = new Set<string>();
  // Bulk workers parked until the library is on screen again.
  const lookWaiters: (() => void)[] = [];

  const store = create<FeedData & Actions>()((set, get) => ({
    feeds: {},
    known: {},
    loading: {},
    full: {},
    hydrated: false,
    backfillProgress: null,
    looking: false,

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

    pinFull(podcastId) {
      pins.set(podcastId, (pins.get(podcastId) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const n = (pins.get(podcastId) ?? 1) - 1;
        if (n > 0) pins.set(podcastId, n);
        else pins.delete(podcastId);
      };
    },

    backfillIdle() {
      return new Promise<void>((resolve) => {
        if (!get().backfillProgress) return resolve();
        const off = store.subscribe((st) => {
          if (st.backfillProgress) return;
          off();
          resolve();
        });
      });
    },

    ingest(podcast, parsed, validators, opts) {
      const sorted = parsed.episodes
        .map((e) => ({ ...e, podcastId: podcast.id }))
        .sort((a, b) => b.published - a.published);
      const wanted = wantFull.delete(podcast.id);
      set((s) => {
        const next: Partial<FeedData & Actions> = {
          feeds: {
            ...s.feeds,
            [podcast.id]: { fetchedAt: Date.now(), total: sorted.length, episodes: sorted.slice(0, MAX_CACHED), validators },
          },
        };
        // A bulk refresh (every show in the library) only needs the newest episodes for the badges: keep the whole feed,
        // with its show notes, only for a few shows (one being opened, one already held and now refreshed, or one a screen
        // asked for while this fetch was in flight).
        if (opts?.keepFull !== false || wanted || s.full[podcast.id]) {
          const full = { ...s.full, [podcast.id]: { episodes: sorted, meta: parsed.podcast } };
          const at = fullOrder.indexOf(podcast.id);
          if (at >= 0) fullOrder.splice(at, 1);
          fullOrder.push(podcast.id);
          for (let i = 0; fullOrder.length > MAX_FULL && i < fullOrder.length; ) {
            const id = fullOrder[i];
            if (id === podcast.id || pins.has(id)) {
              i++;
              continue;
            }
            fullOrder.splice(i, 1);
            delete full[id];
          }
          next.full = full;
        }
        return next;
      });
      onMeta(podcast.id, parsed.podcast);
    },

    async refresh(podcast, opts) {
      if (!podcast.feedUrl) return;
      if (get().loading[podcast.id]) {
        // Already being fetched (possibly by a bulk refresh that keeps only the newest episodes): remember that a screen
        // wants the whole feed, so that fetch's result is kept in full, or the feed is fetched again if it comes back 304.
        if (opts?.keepFull !== false) wantFull.add(podcast.id);
        return;
      }
      set((s) => ({ loading: { ...s.loading, [podcast.id]: true } }));
      try {
        const res = await fetchText(podcast.feedUrl, opts?.conditional ? get().feeds[podcast.id]?.validators : undefined);
        const text = typeof res === 'string' ? res : res.text;
        get().ingest(podcast, parseFeed(text), typeof res === 'string' ? undefined : res.validators, { keepFull: opts?.keepFull });
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
        if (wantFull.delete(podcast.id) && !get().full[podcast.id]) void get().refresh(podcast); // once: a failure here is not retried
      }
    },

    setPriority(ids) {
      rank = new Map(ids.map((id, i) => [id, i]));
    },

    setLooking(looking) {
      if (get().looking === looking) return;
      set({ looking });
      if (looking) lookWaiters.splice(0).forEach((resume) => resume());
    },

    async refreshAll(podcasts, opts) {
      const now = Date.now();
      const pending = podcasts.filter((p) => !opts?.onlyStale || now - (get().feeds[p.id]?.fetchedAt ?? 0) > STALE_MS);
      const worker = async () => {
        for (;;) {
          if (opts?.whileLooking && !get().looking) await new Promise<void>((resume) => lookWaiters.push(resume));
          const p = takeNext(pending);
          if (!p) return;
          await get().refresh(p, { conditional: true, keepFull: false });
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
    },

    async backfill(podcasts, opts) {
      if (get().backfillProgress) return;
      const need = opts?.need ?? ((p: Podcast) => !!p.needsMeta);
      const todo = podcasts.filter((p) => need(p) && p.feedUrl);
      if (!todo.length) return;
      set({ backfillProgress: { done: 0, total: todo.length, label: opts?.label } });
      const pending = [...todo];
      const worker = async () => {
        for (;;) {
          if (opts?.whileLooking && !get().looking) await new Promise<void>((resume) => lookWaiters.push(resume));
          const p = takeNext(pending);
          if (!p) return;
          await get().refresh(p, { keepFull: false });
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
