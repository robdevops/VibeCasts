import { Image } from 'expo-image';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { artworkLow, LOW_ART_PX } from '@/lib/artwork';

/**
 * Small (100 px) copies of artwork whose host can't resize it by URL (anything but iTunes' CDN). They are made once on
 * the phone and kept in the cache folder, so tiles that are mounted but off screen can show them instead of the full
 * image. Not available on web (no file system): the full image is used there.
 */
export const thumbsSupported = Platform.OS !== 'web';

/** True when `artworkLow` can already make a small version by editing the URL. */
export const resizableByUrl = (uri: string): boolean => artworkLow(uri) !== uri;

const made = new Map<string, string>(); // source url -> thumbnail file uri
const missing = new Set<string>(); // checked on disk, not there (cleared when one is made)
const listeners = new Map<string, Set<() => void>>();
let cachedDir: Directory | undefined;
const dirOf = () => (cachedDir ??= new Directory(Paths.cache, 'art-thumbs'));

function nameFor(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h * 33) ^ url.charCodeAt(i)) >>> 0;
  return `${h.toString(16)}-${url.length}.jpg`;
}

/** The small copy of this image, if one has been made. */
export function thumbFor(url: string | undefined): string | undefined {
  if (!url || !thumbsSupported) return undefined;
  const known = made.get(url);
  if (known) return known;
  if (missing.has(url)) return undefined;
  try {
    const file = new File(dirOf(), nameFor(url));
    if (file.exists) {
      made.set(url, file.uri);
      return file.uri;
    }
  } catch {
    // Treated as not there.
  }
  missing.add(url);
  return undefined;
}

function subscribe(url: string, cb: () => void) {
  let set = listeners.get(url);
  if (!set) listeners.set(url, (set = new Set()));
  set.add(cb);
  return () => {
    set.delete(cb);
  };
}

/** The small copy of `url` (re-renders when it appears); undefined when there is none or the host can be resized by URL. */
export function useThumb(url: string | undefined): string | undefined {
  const wanted = url && thumbsSupported && !resizableByUrl(url) ? url : undefined;
  return useSyncExternalStore(
    (cb) => (wanted ? subscribe(wanted, cb) : () => {}),
    () => thumbFor(wanted),
    () => undefined,
  );
}

async function localCopy(url: string): Promise<{ file: File; temporary: boolean } | undefined> {
  // The image is usually already in expo-image's disk cache (the sharp pass fetched it): reuse it rather than download again.
  try {
    const path = await Image.getCachePathAsync(url);
    if (path) return { file: new File(path.startsWith('file:') ? path : `file://${path}`), temporary: false };
  } catch {
    // Fall through to a download.
  }
  try {
    const tmp = new File(dirOf(), `${nameFor(url)}.src`);
    return { file: await File.downloadFileAsync(url, tmp, { idempotent: true }), temporary: true };
  } catch {
    return undefined;
  }
}

async function makeOne(url: string): Promise<void> {
  const src = await localCopy(url);
  if (!src) return;
  try {
    const context = ImageManipulator.manipulate(src.file.uri);
    context.resize({ width: LOW_ART_PX });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
    const dest = new File(dirOf(), nameFor(url));
    new File(saved.uri).move(dest);
    made.set(url, dest.uri);
    missing.delete(url);
    listeners.get(url)?.forEach((cb) => cb());
  } catch {
    // A broken or unsupported image just keeps showing the full one.
  } finally {
    if (src.temporary) {
      try {
        if (src.file.exists) src.file.delete();
      } catch {
        // Best effort.
      }
    }
  }
}

/** Make the missing small copies, one at a time, in the order given (stops when `shouldContinue` says so). */
export async function ensureThumbs(urls: string[], opts: { shouldContinue?: () => boolean; limit?: number } = {}): Promise<void> {
  if (!thumbsSupported) return;
  try {
    dirOf().create({ intermediates: true, idempotent: true });
  } catch {
    return;
  }
  const todo = [...new Set(urls.filter((u) => u && !resizableByUrl(u)))].slice(0, opts.limit ?? 200);
  for (const url of todo) {
    if (opts.shouldContinue && !opts.shouldContinue()) return;
    if (thumbFor(url)) continue;
    await makeOne(url);
    await new Promise((r) => setTimeout(r, 0)); // let the UI breathe between images
  }
}
