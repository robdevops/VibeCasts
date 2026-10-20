import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Artwork } from '@/components/ui/artwork';
import { SHRINK_MS, ZOOM_MS } from '@/lib/folder-zoom';
import { useFlight } from '@/store/flight';

/** The corner radius of a grid tile and of the artwork on a show's page, so the shape changes smoothly in flight. */
const TILE_RADIUS = 8;
const PAGE_RADIUS = 14;

/**
 * Draws a show's artwork gliding between its grid tile and the artwork on the show's page (see `store/flight.ts`), on top
 * of everything. Mounted once at the root.
 */
export function ArtFlight() {
  const phase = useFlight((s) => s.phase);
  const key = useFlight((s) => s.key);
  const uri = useFlight((s) => s.uri);
  const title = useFlight((s) => s.title);
  const from = useFlight((s) => s.from);
  const to = useFlight((s) => s.to);

  const p = useSharedValue(0); // 0 = at the tile, 1 = at the page's artwork
  const fx = useSharedValue(0);
  const fy = useSharedValue(0);
  const fs = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const ts = useSharedValue(0);

  useEffect(() => {
    if (!from || !key) return;
    fx.set(from.x);
    fy.set(from.y);
    fs.set(from.size);
    if (phase === 'opening') {
      if (!to) {
        // Waiting for the page to say where its artwork is; if it never does, give the tile back.
        tx.set(from.x);
        ty.set(from.y);
        ts.set(from.size);
        p.set(0);
        const t = setTimeout(() => useFlight.getState().end(), 1500);
        return () => clearTimeout(t);
      }
      tx.set(to.x);
      ty.set(to.y);
      ts.set(to.size);
      p.set(0);
      p.set(withTiming(1, { duration: ZOOM_MS, easing: Easing.inOut(Easing.cubic) }));
      const t = setTimeout(() => useFlight.getState().land(key), ZOOM_MS + 30);
      return () => clearTimeout(t);
    }
    if (phase === 'closing' && to) {
      tx.set(to.x);
      ty.set(to.y);
      ts.set(to.size);
      p.set(1);
      p.set(withTiming(0, { duration: SHRINK_MS, easing: Easing.out(Easing.cubic) }));
      const t = setTimeout(() => useFlight.getState().end(), SHRINK_MS + 30);
      return () => clearTimeout(t);
    }
  }, [phase, key, from, to, p, fx, fy, fs, tx, ty, ts]);

  const style = useAnimatedStyle(() => {
    const k = p.get();
    return {
      left: fx.get() + (tx.get() - fx.get()) * k,
      top: fy.get() + (ty.get() - fy.get()) * k,
      width: fs.get() + (ts.get() - fs.get()) * k,
      height: fs.get() + (ts.get() - fs.get()) * k,
      borderRadius: TILE_RADIUS + (PAGE_RADIUS - TILE_RADIUS) * k,
    };
  });

  if (!from || (phase !== 'opening' && phase !== 'closing')) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.box, style]}>
      <Artwork uri={uri} title={title} radius={0} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({ box: { position: 'absolute', overflow: 'hidden' } });
