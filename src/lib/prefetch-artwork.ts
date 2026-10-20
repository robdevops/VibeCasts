import { Image } from 'expo-image';
import { Dimensions, PixelRatio } from 'react-native';

import { metricsFor } from '@/lib/grid';

import { artworkLow, artworkSized } from './artwork';

export const MAX_PREFETCH = 200;

/**
 * Warm the image cache with the library's tile artwork, a few at a time, in the order given, so the grid doesn't fill
 * in one picture at a time on a cold start. Uses the same size the tiles will ask for.
 */
export async function prefetchTileArtwork(uris: string[], opts: { batch?: number; shouldContinue?: () => boolean; low?: boolean } = {}): Promise<void> {
  const batch = opts.batch ?? (opts.low ? 16 : 6);
  const px = metricsFor(Dimensions.get('window').width).tile * PixelRatio.get();
  const size = opts.low ? artworkLow : (u: string) => artworkSized(u, px);
  // "The whole lot" stops at 200 shows (in display order) so a huge library can't flood the network or cache.
  // The small pass only covers hosts that can be resized by URL; the others get on-phone thumbnails (`artwork/thumbs`).
  const urls = [...new Set(uris.filter((u) => u && (!opts.low || artworkLow(u) !== u)))].slice(0, MAX_PREFETCH).map(size);
  for (let i = 0; i < urls.length; i += batch) {
    if (opts.shouldContinue && !opts.shouldContinue()) return; // locked or another tab: stop; the next visit picks it up
    await Image.prefetch(urls.slice(i, i + batch), 'memory-disk').catch(() => false);
  }
}
