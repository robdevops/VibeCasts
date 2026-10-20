import { create } from 'zustand';

import type { Podcast } from '@/api/types';
import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';
import { createWriter } from '@/db/writer';
import { emptyEpisodeState, episodeKey, type EpisodeState } from '@/lib/episode-state';
import { parseKey, tileKey, type TileRef } from '@/lib/layout';
import { normalizeFeedUrl, type OpmlFeed } from '@/lib/opml';
import { rssPodcastId } from '@/lib/podcast-id';
import type { PodcastSort } from '@/lib/podcast-sort';

export type Subscription = {
  podcast: Podcast;
  subscribedAt: number;
  folderId?: string;
  /** Per-podcast overrides of the global settings; undefined = use default. */
  overrides: {
    notifications?: boolean;
    autoDownload?: boolean;
    skipFirstSec?: number;
    skipLastSec?: number;
  };
};

export type ImportResult = { added: number; existing: number; folders: number };

/** Details a feed knows about its own show. */
export type PodcastMeta = { title?: string; author?: string; artwork?: string; category?: string; website?: string; description?: string };

/** The subscription id already holding this feed (matched ignoring http/https), if any. */
export function findSubscriptionByFeed(subscriptions: Record<string, Subscription>, feedUrl: string): string | undefined {
  const key = normalizeFeedUrl(feedUrl);
  return Object.keys(subscriptions).find((id) => !!subscriptions[id].podcast.feedUrl && normalizeFeedUrl(subscriptions[id].podcast.feedUrl) === key);
}

export type Folder = { id: string; name: string; color: string; createdAt?: number };


export type LibraryData = {
  subscriptions: Record<string, Subscription>;
  folders: Record<string, Folder>;
  /** Home grid order (podcasts not in a folder + folders). */
  homeOrder: string[];
  /** Per-folder member order (podcast ids). */
  folderOrder: Record<string, string[]>;
  episodes: Record<string, EpisodeState>;
  layout: 'tiles' | 'list';
  sort: PodcastSort;
};

type Actions = {
  hydrated: boolean;
  /**
   * Bumped only when an episode's played/archived state changes (what unplayed counts depend on),
   * not on every progress save, so views that only need counts can skip those updates.
   */
  countsVersion: number;
  hydrate(): Promise<void>;
  subscribe(p: Podcast): void;
  /** Subscribe to many feeds from an OPML file, creating folders for named groups. */
  importFeeds(feeds: OpmlFeed[]): ImportResult;
  /** Fill in details read from the feed itself (artwork, author...) for an imported show. */
  mergePodcastMeta(id: string, meta: PodcastMeta): void;
  unsubscribe(podcastId: string): void;
  createFolder(name: string, color: string): string;
  deleteFolder(folderId: string): void;
  moveToFolder(podcastId: string, folderId: string): void;
  removeFromFolder(podcastId: string): void;
  setHomeOrder(keys: string[]): void;
  /** Set the home order, taking any podcast listed in it out of the folder it was in (a podcast dragged out of a folder, or up from search). */
  placeInHome(keys: string[]): void;
  setFolderOrder(folderId: string, ids: string[]): void;
  renameFolder(folderId: string, name: string, color?: string): void;
  patchEpisode(episodeKey: string, patch: Partial<EpisodeState>): void;
  patchEpisodes(podcastId: string, episodeIds: string[], patch: Partial<EpisodeState>): void;
  setOverride(podcastId: string, patch: Subscription['overrides']): void;
  setLayout(l: LibraryData['layout']): void;
  setSort(s: PodcastSort): void;
};

/** Stamp the moment an episode becomes played (auto archive counts from it). */
function withPlayedAt(prev: EpisodeState, patch: Partial<EpisodeState>): Partial<EpisodeState> {
  if (patch.played === true && !prev.played && patch.playedAt === undefined) return { ...patch, playedAt: Date.now() };
  if (patch.played === false) return { ...patch, playedAt: undefined };
  return patch;
}

export const FOLDER_COLORS = ['#F5B63A', '#F28B3C', '#6CC24A', '#3AA0E8', '#5B6BE0', '#9B6BD6', '#8A8D93'];

const initial: LibraryData = {
  subscriptions: {},
  folders: {},
  homeOrder: [],
  folderOrder: {},
  episodes: {},
  layout: 'tiles',
  sort: 'custom',
};

export { episodeKey };

const STORAGE_KEY = 'library.v1';

export function createLibraryStore(storage: KV = kv) {
  const store = create<LibraryData & Actions>()((set, get) => ({
    ...initial,
    hydrated: false,
    countsVersion: 0,

    async hydrate() {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        if (raw) set({ ...initial, ...(JSON.parse(raw) as Partial<LibraryData>) });
      } catch {
        // Corrupt or unavailable storage: start empty rather than crash.
      }
      set((s) => ({ hydrated: true, countsVersion: s.countsVersion + 1 }));
    },

    subscribe(p) {
      // The same show can arrive with different ids (iTunes id vs. an imported feed URL).
      if (get().subscriptions[p.id] || (p.feedUrl && findSubscriptionByFeed(get().subscriptions, p.feedUrl))) return;
      const key = tileKey({ type: 'podcast', id: p.id });
      set((s) => ({
        subscriptions: {
          ...s.subscriptions,
          [p.id]: { podcast: p, subscribedAt: Date.now(), overrides: {} },
        },
        homeOrder: [...s.homeOrder, key],
      }));
    },

    importFeeds(feeds) {
      const result: ImportResult = { added: 0, existing: 0, folders: 0 };
      set((s) => {
        const subscriptions = { ...s.subscriptions };
        const folders = { ...s.folders };
        const folderOrder = { ...s.folderOrder };
        const homeOrder = [...s.homeOrder];
        const folderByName = new Map(Object.values(folders).map((f) => [f.name.toLowerCase(), f.id]));
        const at = Date.now();

        for (const feed of feeds) {
          if (findSubscriptionByFeed(subscriptions, feed.feedUrl)) {
            result.existing++;
            continue;
          }
          let folderId: string | undefined;
          if (feed.folder) {
            folderId = folderByName.get(feed.folder.toLowerCase());
            if (!folderId) {
              folderId = `${(at + result.folders).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
              folders[folderId] = { id: folderId, name: feed.folder, color: FOLDER_COLORS[Object.keys(folders).length % FOLDER_COLORS.length], createdAt: at };
              folderOrder[folderId] = [];
              homeOrder.push(tileKey({ type: 'folder', id: folderId }));
              folderByName.set(feed.folder.toLowerCase(), folderId);
              result.folders++;
            }
          }
          const id = rssPodcastId(feed.feedUrl);
          subscriptions[id] = {
            podcast: { id, title: feed.title, author: '', artwork: '', feedUrl: feed.feedUrl, website: feed.htmlUrl, needsMeta: true },
            subscribedAt: at + result.added,
            folderId,
            overrides: {},
          };
          if (folderId) folderOrder[folderId] = [...(folderOrder[folderId] ?? []), id];
          else homeOrder.push(tileKey({ type: 'podcast', id }));
          result.added++;
        }
        return result.added ? { subscriptions, folders, folderOrder, homeOrder } : s;
      });
      return result;
    },

    mergePodcastMeta(id, meta) {
      set((s) => {
        const sub = s.subscriptions[id];
        if (!sub) return s;
        const p = sub.podcast;
        const next = {
          ...p,
          // An imported title is only a placeholder from the file; the feed's own title wins once, then it's the user's.
          title: p.needsMeta ? meta.title || p.title : p.title,
          author: p.author || meta.author || '',
          artwork: p.artwork || meta.artwork || '',
          category: p.category ?? meta.category,
          website: p.website ?? meta.website,
          description: p.description ?? meta.description,
          needsMeta: false,
        };
        return { subscriptions: { ...s.subscriptions, [id]: { ...sub, podcast: next } } };
      });
    },

    unsubscribe(id) {
      const key = tileKey({ type: 'podcast', id });
      set((s) => {
        const { [id]: removed, ...subscriptions } = s.subscriptions;
        const folderOrder = { ...s.folderOrder };
        if (removed?.folderId) {
          folderOrder[removed.folderId] = (folderOrder[removed.folderId] ?? []).filter((x) => x !== id);
        }
        return { subscriptions, folderOrder, homeOrder: s.homeOrder.filter((k) => k !== key) };
      });
    },

    createFolder(name, color) {
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      set((s) => ({
        folders: { ...s.folders, [id]: { id, name, color, createdAt: Date.now() } },
        folderOrder: { ...s.folderOrder, [id]: [] },
        homeOrder: [...s.homeOrder, tileKey({ type: 'folder', id })],
      }));
      return id;
    },

    deleteFolder(folderId) {
      set((s) => {
        const members = s.folderOrder[folderId] ?? [];
        const { [folderId]: _f, ...folders } = s.folders;
        const { [folderId]: _o, ...folderOrder } = s.folderOrder;
        const subscriptions = { ...s.subscriptions };
        for (const id of members) {
          if (subscriptions[id]) subscriptions[id] = { ...subscriptions[id], folderId: undefined };
        }
        const fKey = tileKey({ type: 'folder', id: folderId });
        const at = s.homeOrder.indexOf(fKey);
        const memberKeys = members.map((id) => tileKey({ type: 'podcast', id }));
        const homeOrder = [...s.homeOrder];
        homeOrder.splice(at < 0 ? homeOrder.length : at, 1, ...memberKeys);
        return { folders, folderOrder, subscriptions, homeOrder };
      });
    },

    moveToFolder(podcastId, folderId) {
      set((s) => {
        const sub = s.subscriptions[podcastId];
        if (!sub || !s.folders[folderId] || sub.folderId === folderId) return s;
        const folderOrder = { ...s.folderOrder };
        if (sub.folderId) folderOrder[sub.folderId] = folderOrder[sub.folderId].filter((x) => x !== podcastId);
        folderOrder[folderId] = [...(folderOrder[folderId] ?? []), podcastId];
        return {
          subscriptions: { ...s.subscriptions, [podcastId]: { ...sub, folderId } },
          folderOrder,
          homeOrder: s.homeOrder.filter((k) => k !== tileKey({ type: 'podcast', id: podcastId })),
        };
      });
    },

    removeFromFolder(podcastId) {
      set((s) => {
        const sub = s.subscriptions[podcastId];
        if (!sub?.folderId) return s;
        const folderOrder = {
          ...s.folderOrder,
          [sub.folderId]: s.folderOrder[sub.folderId].filter((x) => x !== podcastId),
        };
        return {
          subscriptions: { ...s.subscriptions, [podcastId]: { ...sub, folderId: undefined } },
          folderOrder,
          homeOrder: [...s.homeOrder, tileKey({ type: 'podcast', id: podcastId })],
        };
      });
    },

    setHomeOrder: (keys) => set({ homeOrder: keys, sort: 'custom' }),

    placeInHome(keys) {
      set((s) => {
        const subscriptions = { ...s.subscriptions };
        const folderOrder = { ...s.folderOrder };
        for (const key of keys) {
          const { type, id } = parseKey(key);
          const sub = type === 'podcast' ? subscriptions[id] : undefined;
          if (!sub?.folderId) continue;
          folderOrder[sub.folderId] = (folderOrder[sub.folderId] ?? []).filter((x) => x !== id);
          subscriptions[id] = { ...sub, folderId: undefined };
        }
        return { subscriptions, folderOrder, homeOrder: keys, sort: 'custom' };
      });
    },
    setFolderOrder: (folderId, ids) => set((s) => ({ folderOrder: { ...s.folderOrder, [folderId]: ids } })),
    renameFolder(folderId, name, color) {
      set((s) => {
        const f = s.folders[folderId];
        return f ? { folders: { ...s.folders, [folderId]: { ...f, name, color: color ?? f.color } } } : s;
      });
    },

    patchEpisode(key, patch) {
      set((s) => {
        const prev = s.episodes[key] ?? emptyEpisodeState;
        const next = { ...prev, ...withPlayedAt(prev, patch) };
        const countsChanged = next.played !== prev.played || next.archived !== prev.archived;
        return { episodes: { ...s.episodes, [key]: next }, ...(countsChanged ? { countsVersion: s.countsVersion + 1 } : null) };
      });
    },

    patchEpisodes(podcastId, ids, patch) {
      set((s) => {
        const episodes = { ...s.episodes };
        let countsChanged = false;
        for (const id of ids) {
          const key = episodeKey(podcastId, id);
          const prev = episodes[key] ?? emptyEpisodeState;
          const next = { ...prev, ...withPlayedAt(prev, patch) };
          if (next.played !== prev.played || next.archived !== prev.archived) countsChanged = true;
          episodes[key] = next;
        }
        return { episodes, ...(countsChanged ? { countsVersion: s.countsVersion + 1 } : null) };
      });
    },

    setOverride(id, patch) {
      set((s) => {
        const sub = s.subscriptions[id];
        return sub
          ? { subscriptions: { ...s.subscriptions, [id]: { ...sub, overrides: { ...sub.overrides, ...patch } } } }
          : s;
      });
    },

    setLayout: (layout) => set({ layout }),
    setSort: (sort) => set({ sort }),
  }));

  // Persist data (not actions) after hydration, coalescing bursts of writes. Playback saves progress
  // every few seconds, which touches only the episode states: those can wait longer than structural
  // changes (the app flushes everything when it goes to the background).
  const writer = createWriter(storage, STORAGE_KEY);
  store.subscribe((s, prev) => {
    if (!s.hydrated) return;
    const progressOnly =
      s.episodes !== prev.episodes &&
      s.subscriptions === prev.subscriptions &&
      s.folders === prev.folders &&
      s.homeOrder === prev.homeOrder &&
      s.folderOrder === prev.folderOrder &&
      s.layout === prev.layout &&
      s.sort === prev.sort;
    writer.schedule(
      () => {
        const data: LibraryData = {
          subscriptions: s.subscriptions,
          folders: s.folders,
          homeOrder: s.homeOrder,
          folderOrder: s.folderOrder,
          episodes: s.episodes,
          layout: s.layout,
          sort: s.sort,
        };
        return JSON.stringify(data);
      },
      progressOnly ? 2500 : 150,
    );
  });

  return store;
}

export const useLibrary = createLibraryStore();

export type { TileRef };

/** What an import would do, without changing anything (for the preview step). */
export function previewImport(feeds: OpmlFeed[], subscriptions: Record<string, Subscription>) {
  const existing = feeds.filter((f) => findSubscriptionByFeed(subscriptions, f.feedUrl)).length;
  const folders = new Set(feeds.filter((f) => f.folder).map((f) => f.folder!.toLowerCase())).size;
  return { found: feeds.length, existing, fresh: feeds.length - existing, folders };
}
