import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { create } from 'zustand';

import type { Episode, Podcast } from '@/api/types';
import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';
import { episodeKey } from '@/lib/episode-state';
import { useLibrary } from '@/store/library';

import { audioExtension } from './episode-cache';

/** Files on disk. Faked in tests; undefined on web (no file system). */
export interface DownloadFiles {
  /** Fetch `url` to a file named from `key`; resolves with the local URI. */
  fetch(key: string, url: string): Promise<{ uri: string; sizeBytes?: number }>;
  remove(uri: string): void;
}

/** What the Downloads screen needs to show an episode without its feed. */
export type DownloadEntry = {
  podcast: Pick<Podcast, 'id' | 'title' | 'artwork' | 'author' | 'feedUrl'>;
  episode: Omit<Episode, 'description'>;
  sizeBytes?: number;
};

type Data = {
  entries: Record<string, DownloadEntry>;
  /** In flight, by episode key. */
  active: Record<string, true>;
  failed: Record<string, true>;
};

type Actions = {
  hydrated: boolean;
  hydrate(): Promise<void>;
  download(episode: Episode, podcast: Podcast, opts?: { auto?: boolean }): void;
  remove(podcastId: string, episodeId: string): void;
  removeAll(): void;
};

const STORAGE_KEY = 'downloads.v1';
const MAX_PARALLEL = 2;

function safeName(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function createFileDownloads(): DownloadFiles | undefined {
  if (Platform.OS === 'web') return undefined;
  let dir: Directory | undefined;
  const dirOf = () => (dir ??= new Directory(Paths.document, 'downloads'));
  return {
    async fetch(key, url) {
      dirOf().create({ intermediates: true, idempotent: true });
      const file = await File.downloadFileAsync(url, new File(dirOf(), `${safeName(key)}.${audioExtension(url)}`), { idempotent: true });
      return { uri: file.uri, sizeBytes: file.size ?? undefined };
    },
    remove(uri) {
      try {
        const f = new File(uri);
        if (f.exists) f.delete();
      } catch {
        // Already gone.
      }
    },
  };
}

type Deps = { files?: DownloadFiles; storage: KV; library: Pick<typeof useLibrary, 'getState'>; now: () => number };

export function createDownloadManager(deps: Partial<Deps> = {}) {
  const files = 'files' in deps ? deps.files : createFileDownloads();
  const storage = deps.storage ?? kv;
  const library = deps.library ?? useLibrary;
  const now = deps.now ?? Date.now;
  const queue: (() => Promise<void>)[] = [];
  let running = 0;

  const pump = () => {
    while (running < MAX_PARALLEL && queue.length) {
      const job = queue.shift()!;
      running++;
      void job().finally(() => {
        running--;
        pump();
      });
    }
  };

  const store = create<Data & Actions>()((set, get) => ({
    entries: {},
    active: {},
    failed: {},
    hydrated: false,

    async hydrate() {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        if (raw) set({ entries: (JSON.parse(raw) as { entries: Data['entries'] }).entries ?? {} });
      } catch {
        // Start with none; files on disk are still referenced by the library.
      }
      set({ hydrated: true });
    },

    download(episode, podcast, opts) {
      if (!files) return;
      const key = episodeKey(podcast.id, episode.id);
      const have = library.getState().episodes[key]?.downloadedUri;
      if (get().active[key]) return;
      if (have) {
        // Choosing a download yourself protects it from auto rotation.
        if (!opts?.auto) library.getState().patchEpisode(key, { autoDownloaded: false });
        return;
      }
      set((s) => ({ active: { ...s.active, [key]: true }, failed: omit(s.failed, key) }));
      queue.push(async () => {
        try {
          const { uri, sizeBytes } = await files.fetch(key, episode.audioUrl);
          const { description: _d, ...slim } = episode;
          library.getState().patchEpisode(key, { downloadedUri: uri, downloadedAt: now(), autoDownloaded: !!opts?.auto });
          set((s) => ({
            entries: {
              ...s.entries,
              [key]: {
                podcast: { id: podcast.id, title: podcast.title, artwork: podcast.artwork, author: podcast.author, feedUrl: podcast.feedUrl },
                episode: slim,
                sizeBytes,
              },
            },
          }));
        } catch {
          set((s) => ({ failed: { ...s.failed, [key]: true } }));
        } finally {
          set((s) => ({ active: omit(s.active, key) }));
        }
      });
      pump();
    },

    remove(podcastId, episodeId) {
      const key = episodeKey(podcastId, episodeId);
      const uri = library.getState().episodes[key]?.downloadedUri;
      if (uri) files?.remove(uri);
      library.getState().patchEpisode(key, { downloadedUri: undefined, downloadedAt: undefined, autoDownloaded: undefined });
      set((s) => ({ entries: omit(s.entries, key) }));
    },

    removeAll() {
      for (const [key, e] of Object.entries(library.getState().episodes)) {
        if (!e.downloadedUri) continue;
        const [podcastId, ...rest] = key.split('|');
        get().remove(podcastId, rest.join('|'));
      }
    },
  }));

  let timer: ReturnType<typeof setTimeout> | undefined;
  store.subscribe((s, prev) => {
    if (!s.hydrated || s.entries === prev.entries) return;
    clearTimeout(timer);
    timer = setTimeout(() => storage.setItem(STORAGE_KEY, JSON.stringify({ entries: s.entries })).catch(() => {}), 500);
  });
  return store;
}

function omit<T extends Record<string, unknown>>(obj: T, key: string): T {
  const { [key]: _gone, ...rest } = obj;
  return rest as T;
}

export const useDownloads = createDownloadManager();

/** Downloads need a file system, which the web build doesn't have. */
export const downloadsSupported = Platform.OS !== 'web';
