import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useSyncExternalStore } from 'react';
import { Dimensions, PixelRatio, Platform } from 'react-native';

import { artworkSized } from '@/lib/artwork';
import { metricsFor } from '@/lib/grid';

/**
 * Tile-sized copies of artwork whose host can't resize it by URL (everything but iTunes' CDN, i.e. most imported shows,
 * which are often 1400-3000 px). Decoding those originals is what makes tiles slow to come back after a scroll. A copy is
 * made once on the phone and kept in the cache folder; the grid shows it instead. Not available on web (full image).
 */
/** Master switch (for comparing with and without): false makes no thumbnails and shows the original images. Copies already on the phone are ignored. */
export const THUMBNAILS_ENABLED = false;
export const thumbsSupported = Platform.OS !== 'web' && THUMBNAILS_ENABLED;

/** The size tiles ask for, rounded up to 100 px (same rule as `artworkSized`). */
export const tileThumbPx = (): number => Math.max(100, Math.ceil((metricsFor(Dimensions.get('window').width).tile * PixelRatio.get()) / 100) * 100);

/** True when the host can already be resized by editing the URL. */
export const resizableByUrl = (uri: string): boolean => artworkSized(uri, 100) !== uri;

const made = new Map<string, string>(); // source url -> thumbnail file uri
const missing = new Set<string>(); // checked on disk, not there (cleared when one is made)
const listeners = new Map<string, Set<() => void>>();
let cachedDir: Directory | undefined;
const dirOf = () => (cachedDir ??= new Directory(Paths.cache, 'art-thumbs'));

function nameFor(url: string, px: number): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h * 33) ^ url.charCodeAt(i)) >>> 0;
  return `${h.toString(16)}-${url.length}-${px}.jpg`;
}

/** The tile-sized copy of this image, if one has been made. */
export function thumbFor(url: string | undefined, px: number): string | undefined {
  if (!url || !thumbsSupported) return undefined;
  const id = `${px}|${url}`;
  const known = made.get(id);
  if (known) return known;
  if (missing.has(id)) return undefined;
  try {
    const file = new File(dirOf(), nameFor(url, px));
    if (file.exists) {
      made.set(id, file.uri);
      return file.uri;
    }
  } catch {
    // Treated as not there.
  }
  missing.add(id);
  return undefined;
}

function subscribe(id: string, cb: () => void) {
  let set = listeners.get(id);
  if (!set) listeners.set(id, (set = new Set()));
  set.add(cb);
  return () => {
    set.delete(cb);
  };
}

/** The tile-sized copy of `url` (re-renders when it appears); undefined when there is none or the host resizes by URL. */
export function useThumb(url: string | undefined, px: number): string | undefined {
  const wanted = url && thumbsSupported && !resizableByUrl(url) ? url : undefined;
  return useSyncExternalStore(
    (cb) => (wanted ? subscribe(`${px}|${wanted}`, cb) : () => {}),
    () => thumbFor(wanted, px),
    () => undefined,
  );
}

async function localCopy(url: string, px: number): Promise<{ file: File; temporary: boolean } | undefined> {
  // Usually already in expo-image's disk cache (the prefetch fetched it): reuse it rather than download again.
  try {
    const path = await Image.getCachePathAsync(url);
    if (path) return { file: new File(path.startsWith('file:') ? path : `file://${path}`), temporary: false };
  } catch {
    // Fall through to a download.
  }
  try {
    const tmp = new File(dirOf(), `${nameFor(url, px)}.src`);
    return { file: await File.downloadFileAsync(url, tmp, { idempotent: true }), temporary: true };
  } catch {
    return undefined;
  }
}

async function makeOne(url: string, px: number): Promise<void> {
  const src = await localCopy(url, px);
  if (!src) return;
  try {
    const context = ImageManipulator.manipulate(src.file.uri);
    context.resize({ width: px });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    const dest = new File(dirOf(), nameFor(url, px));
    new File(saved.uri).move(dest);
    const id = `${px}|${url}`;
    made.set(id, dest.uri);
    missing.delete(id);
    listeners.get(id)?.forEach((cb) => cb());
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

/** Make the missing tile-sized copies, one at a time, in the order given (stops when `shouldContinue` says so). */
export async function ensureThumbs(urls: string[], opts: { shouldContinue?: () => boolean; limit?: number } = {}): Promise<void> {
  if (!thumbsSupported) return;
  try {
    dirOf().create({ intermediates: true, idempotent: true });
  } catch {
    return;
  }
  const px = tileThumbPx();
  const todo = [...new Set(urls.filter((u) => u && !resizableByUrl(u)))].slice(0, opts.limit ?? 200);
  for (const url of todo) {
    if (opts.shouldContinue && !opts.shouldContinue()) return;
    if (thumbFor(url, px)) continue;
    await makeOne(url, px);
    await new Promise((r) => setTimeout(r, 0)); // let the UI breathe between images
  }
}
