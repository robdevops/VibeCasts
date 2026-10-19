import { create } from 'zustand';

import type { Podcast } from '@/api/types';
import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';
import { emptyEpisodeState, episodeKey, type EpisodeState } from '@/lib/episode-state';
import { tileKey, type TileRef } from '@/lib/layout';
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
  hydrate(): Promise<void>;
  subscribe(p: Podcast): void;
  unsubscribe(podcastId: string): void;
  createFolder(name: string, color: string): string;
  deleteFolder(folderId: string): void;
  moveToFolder(podcastId: string, folderId: string): void;
  removeFromFolder(podcastId: string): void;
  setHomeOrder(keys: string[]): void;
  setFolderOrder(folderId: string, ids: string[]): void;
  renameFolder(folderId: string, name: string, color?: string): void;
  patchEpisode(episodeKey: string, patch: Partial<EpisodeState>): void;
  patchEpisodes(podcastId: string, episodeIds: string[], patch: Partial<EpisodeState>): void;
  setOverride(podcastId: string, patch: Subscription['overrides']): void;
  setLayout(l: LibraryData['layout']): void;
  setSort(s: PodcastSort): void;
};

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

    async hydrate() {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        if (raw) set({ ...initial, ...(JSON.parse(raw) as Partial<LibraryData>) });
      } catch {
        // Corrupt or unavailable storage: start empty rather than crash.
      }
      set({ hydrated: true });
    },

    subscribe(p) {
      if (get().subscriptions[p.id]) return;
      const key = tileKey({ type: 'podcast', id: p.id });
      set((s) => ({
        subscriptions: {
          ...s.subscriptions,
          [p.id]: { podcast: p, subscribedAt: Date.now(), overrides: {} },
        },
        homeOrder: [...s.homeOrder, key],
      }));
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
    setFolderOrder: (folderId, ids) => set((s) => ({ folderOrder: { ...s.folderOrder, [folderId]: ids } })),
    renameFolder(folderId, name, color) {
      set((s) => {
        const f = s.folders[folderId];
        return f ? { folders: { ...s.folders, [folderId]: { ...f, name, color: color ?? f.color } } } : s;
      });
    },

    patchEpisode(key, patch) {
      set((s) => ({
        episodes: { ...s.episodes, [key]: { ...(s.episodes[key] ?? emptyEpisodeState), ...patch } },
      }));
    },

    patchEpisodes(podcastId, ids, patch) {
      set((s) => {
        const episodes = { ...s.episodes };
        for (const id of ids) {
          const key = episodeKey(podcastId, id);
          episodes[key] = { ...(episodes[key] ?? emptyEpisodeState), ...patch };
        }
        return { episodes };
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

  // Persist data (not actions) after hydration, coalescing bursts of writes.
  let timer: ReturnType<typeof setTimeout> | undefined;
  store.subscribe((s) => {
    if (!s.hydrated) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const data: LibraryData = {
        subscriptions: s.subscriptions,
        folders: s.folders,
        homeOrder: s.homeOrder,
        folderOrder: s.folderOrder,
        episodes: s.episodes,
        layout: s.layout,
        sort: s.sort,
      };
      storage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
    }, 150);
  });

  return store;
}

export const useLibrary = createLibraryStore();

export type { TileRef };
