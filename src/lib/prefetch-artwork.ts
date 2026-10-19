import { Image } from 'expo-image';
import { Dimensions, PixelRatio } from 'react-native';

import { metricsFor } from '@/lib/grid';

import { artworkSized } from './artwork';

/**
 * Warm the image cache with the library's tile artwork, a few at a time, so the grid doesn't fill
 * in one picture at a time on a cold start. Uses the same size the tiles will ask for.
 */
export async function prefetchTileArtwork(uris: string[], batch = 6): Promise<void> {
  const px = metricsFor(Dimensions.get('window').width).tile * PixelRatio.get();
  const urls = [...new Set(uris.filter(Boolean))].map((u) => artworkSized(u, px));
  for (let i = 0; i < urls.length; i += batch) {
    await Image.prefetch(urls.slice(i, i + batch), 'memory-disk').catch(() => false);
  }
}
