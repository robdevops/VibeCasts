import { create } from 'zustand';

import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';
import { episodeKey } from '@/lib/episode-state';
import { findNewEpisodes, notificationText } from '@/lib/new-episodes';
import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';

/** The device side of notifications. Faked in tests. */
export interface NotifyPlatform {
  /** Is posting allowed right now (never prompts: it also runs in the background)? */
  canPost(): Promise<boolean>;
  post(n: { id: string; title: string; body: string; data: { podcastId: string; episodeId: string } }): Promise<void>;
}

const STORAGE_KEY = 'notified.v1';

type Deps = {
  platform: NotifyPlatform | undefined;
  storage: KV;
  library: Pick<typeof useLibrary, 'getState'>;
  feeds: Pick<typeof useFeeds, 'getState'>;
};

export function createNotifier(deps: Partial<Deps> = {}) {
  const platform = deps.platform;
  const storage = deps.storage ?? kv;
  const library = deps.library ?? useLibrary;
  const feeds = deps.feeds ?? useFeeds;

  const store = create<{ seen: Record<string, string[]>; hydrated: boolean }>()(() => ({ seen: {}, hydrated: false }));
  let hydrating: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const hydrate = () =>
    (hydrating ??= (async () => {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        if (raw) store.setState({ seen: JSON.parse(raw) as Record<string, string[]> });
      } catch {
        // Start from baselines.
      }
      store.setState({ hydrated: true });
    })());

  const persistSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => storage.setItem(STORAGE_KEY, JSON.stringify(store.getState().seen)).catch(() => {}), 300);
  };

  /** Announce episodes that appeared since the last check, for podcasts with notifications on. */
  async function check(): Promise<number> {
    await hydrate();
    const subs = Object.values(library.getState().subscriptions).filter((s) => s.overrides.notifications);
    if (!subs.length) return 0;
    const allowed = platform ? await platform.canPost() : false;
    let sent = 0;
    const seen = { ...store.getState().seen };
    for (const sub of subs) {
      const episodes = feeds.getState().feeds[sub.podcast.id]?.episodes;
      if (!episodes) continue; // not fetched yet: wait for a baseline rather than guess
      const r = findNewEpisodes(episodes, seen[sub.podcast.id]);
      // Only announce what is still unplayed.
      const fresh = r.fresh.filter((e) => !library.getState().episodes[episodeKey(sub.podcast.id, e.id)]?.played);
      seen[sub.podcast.id] = r.seen;
      if (fresh.length && allowed && platform) {
        const text = notificationText(sub.podcast.title, fresh);
        await platform.post({ id: `new-${sub.podcast.id}`, ...text, data: { podcastId: sub.podcast.id, episodeId: fresh[0].id } });
        sent++;
      }
    }
    store.setState({ seen });
    persistSoon();
    return sent;
  }

  return { check, hydrate, store };
}
