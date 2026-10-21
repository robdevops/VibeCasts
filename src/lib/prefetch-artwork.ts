import { Image } from 'expo-image';
import { Dimensions, PixelRatio } from 'react-native';

import { metricsFor } from '@/lib/grid';

import { artworkSized } from './artwork';

/**
 * Warm the image cache with the library's tile artwork, a few at a time, in the order given, so the grid doesn't fill
 * in one picture at a time on a cold start. Uses the same size the tiles will ask for.
 */
export async function prefetchTileArtwork(uris: string[], opts: { batch?: number; shouldContinue?: () => boolean } = {}): Promise<void> {
  const batch = opts.batch ?? 6;
  const px = metricsFor(Dimensions.get('window').width).tile * PixelRatio.get();
  const urls = [...new Set(uris.filter(Boolean))].map((u) => artworkSized(u, px));
  for (let i = 0; i < urls.length; i += batch) {
    if (opts.shouldContinue && !opts.shouldContinue()) return; // locked or another tab: stop; the next visit picks it up
    await Image.prefetch(urls.slice(i, i + batch), 'memory-disk').catch(() => false);
  }
}
