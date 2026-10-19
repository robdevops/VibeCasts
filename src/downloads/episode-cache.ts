import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Temporary whole-episode cache for "cache whole episodes": the file is fetched in one fast burst
 * (so the radio can sleep) and playback then switches to it. Not the user's downloads: files here
 * are removed when you finish or move on.
 */
export interface EpisodeCache {
  /** Fetch `url` in full; `onReady` gets the local file URI when complete. Failures are silent. */
  start(key: string, url: string, onReady: (uri: string) => void): void;
  /** The cached file for this episode, if it has finished downloading. */
  uriFor(key: string): string | undefined;
  /** Forget and delete one episode's file (also cancels interest in an in-flight download). */
  release(key: string): void;
  /** Delete every cached file (app start: the in-memory index is gone). */
  clear(): void;
}

/** FNV-1a so keys (which contain ids from feeds) become safe file names. */
function safeName(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Keep the real extension (players use it as a format hint); default to mp3. */
export function audioExtension(url: string): string {
  const m = /\.(mp3|m4a|aac|ogg|opus|wav|flac|mp4)(?:$|[?#])/i.exec(url);
  return (m?.[1] ?? 'mp3').toLowerCase();
}

export function createFileEpisodeCache(): EpisodeCache | undefined {
  if (Platform.OS === 'web') return undefined;
  // Built on first use: constructing it touches the native module.
  let cachedDir: Directory | undefined;
  const dirOf = () => (cachedDir ??= new Directory(Paths.cache, 'episode-cache'));
  const ready = new Map<string, string>();
  const wanted = new Set<string>();

  const fileFor = (key: string, url: string) => new File(dirOf(), `${safeName(key)}.${audioExtension(url)}`);
  const safeDelete = (file: File) => {
    try {
      if (file.exists) file.delete();
    } catch {
      // Nothing useful to do if the OS already removed it.
    }
  };

  return {
    start(key, url, onReady) {
      if (ready.has(key)) {
        onReady(ready.get(key) as string);
        return;
      }
      wanted.add(key);
      const file = fileFor(key, url);
      try {
        dirOf().create({ intermediates: true, idempotent: true });
      } catch {
        return;
      }
      File.downloadFileAsync(url, file, { idempotent: true })
        .then((done) => {
          if (!wanted.has(key)) {
            safeDelete(done); // the user moved on while it downloaded
            return;
          }
          ready.set(key, done.uri);
          onReady(done.uri);
        })
        .catch(() => {
          wanted.delete(key);
          safeDelete(file);
        });
    },
    uriFor: (key) => ready.get(key),
    release(key) {
      wanted.delete(key);
      const uri = ready.get(key);
      ready.delete(key);
      if (uri) safeDelete(new File(uri));
    },
    clear() {
      wanted.clear();
      ready.clear();
      try {
        if (dirOf().exists) dirOf().delete();
      } catch {
        // Best effort.
      }
    },
  };
}

/** In-memory stand-in for tests. `finish(key)` completes a started download. */
export function createFakeEpisodeCache() {
  const ready = new Map<string, string>();
  const pending = new Map<string, { url: string; onReady: (uri: string) => void }>();
  const log: string[] = [];
  const cache: EpisodeCache = {
    start(key, url, onReady) {
      log.push(`start ${key}`);
      pending.set(key, { url, onReady });
    },
    uriFor: (key) => ready.get(key),
    release(key) {
      log.push(`release ${key}`);
      pending.delete(key);
      ready.delete(key);
    },
    clear() {
      log.push('clear');
      pending.clear();
      ready.clear();
    },
  };
  return {
    cache,
    log,
    finish(key: string) {
      const p = pending.get(key);
      if (!p) return;
      pending.delete(key);
      const uri = `file:///cache/${key}.mp3`;
      ready.set(key, uri);
      p.onReady(uri);
    },
  };
}
