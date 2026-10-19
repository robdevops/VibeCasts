import { create } from 'zustand';

import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';
import { addRefs, moveRef, refKey, removeRef, type EpisodeRef } from '@/lib/playlist';

export type Playlist = { id: string; name: string; createdAt: number; items: EpisodeRef[] };

type Data = {
  /** Episodes queued to play after the current one. */
  upNext: EpisodeRef[];
  playlists: Playlist[];
  hydrated: boolean;
};

type Actions = {
  hydrate(): Promise<void>;
  playNext(refs: EpisodeRef[]): void;
  playLast(refs: EpisodeRef[]): void;
  /** Remove and return the first queued episode (auto-advance). */
  takeNext(): EpisodeRef | undefined;
  /** Drop an episode from Up Next (it was started some other way). */
  forget(key: string): void;
  removeFromQueue(key: string): void;
  moveInQueue(from: number, to: number): void;
  clearQueue(): void;
  /** Replace Up Next with these episodes (play all). */
  setQueue(refs: EpisodeRef[]): void;
  createPlaylist(name: string): string;
  renamePlaylist(id: string, name: string): void;
  deletePlaylist(id: string): void;
  addToPlaylist(id: string, refs: EpisodeRef[]): void;
  removeFromPlaylist(id: string, key: string): void;
  moveInPlaylist(id: string, from: number, to: number): void;
};

const STORAGE_KEY = 'playlists.v1';

export function createPlaylistStore(storage: KV = kv) {
  const store = create<Data & Actions>()((set, get) => {
    const patchPlaylist = (id: string, fn: (p: Playlist) => Playlist) =>
      set((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? fn(p) : p)) }));

    return {
      upNext: [],
      playlists: [],
      hydrated: false,

      async hydrate() {
        try {
          const raw = await storage.getItem(STORAGE_KEY);
          if (raw) {
            const saved = JSON.parse(raw) as Partial<Data>;
            set({ upNext: saved.upNext ?? [], playlists: saved.playlists ?? [] });
          }
        } catch {
          // Start empty.
        }
        set({ hydrated: true });
      },

      playNext: (refs) => set((s) => ({ upNext: addRefs(s.upNext, refs, 'first') })),
      playLast: (refs) => set((s) => ({ upNext: addRefs(s.upNext, refs, 'last') })),

      takeNext() {
        const [first, ...rest] = get().upNext;
        if (!first) return undefined;
        set({ upNext: rest });
        return first;
      },

      forget(key) {
        if (get().upNext.some((r) => refKey(r) === key)) set((s) => ({ upNext: removeRef(s.upNext, key) }));
      },
      removeFromQueue: (key) => set((s) => ({ upNext: removeRef(s.upNext, key) })),
      moveInQueue: (from, to) => set((s) => ({ upNext: moveRef(s.upNext, from, to) })),
      clearQueue: () => set({ upNext: [] }),
      setQueue: (refs) => set({ upNext: addRefs([], refs, 'last') }),

      createPlaylist(name) {
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        set((s) => ({ playlists: [...s.playlists, { id, name: name.trim(), createdAt: Date.now(), items: [] }] }));
        return id;
      },
      renamePlaylist: (id, name) => patchPlaylist(id, (p) => ({ ...p, name: name.trim() || p.name })),
      deletePlaylist: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),
      addToPlaylist: (id, refs) => patchPlaylist(id, (p) => ({ ...p, items: addRefs(p.items, refs, 'last') })),
      removeFromPlaylist: (id, key) => patchPlaylist(id, (p) => ({ ...p, items: removeRef(p.items, key) })),
      moveInPlaylist: (id, from, to) => patchPlaylist(id, (p) => ({ ...p, items: moveRef(p.items, from, to) })),
    };
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  store.subscribe((s, prev) => {
    if (!s.hydrated || (s.upNext === prev.upNext && s.playlists === prev.playlists)) return;
    clearTimeout(timer);
    timer = setTimeout(() => storage.setItem(STORAGE_KEY, JSON.stringify({ upNext: s.upNext, playlists: s.playlists })).catch(() => {}), 400);
  });
  return store;
}

export const usePlaylists = createPlaylistStore();
