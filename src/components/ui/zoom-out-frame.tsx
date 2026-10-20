import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { FOLDER_ZOOM, SHRINK_MS, takeZoomOrigin } from '@/lib/folder-zoom';

/**
 * Wraps a page opened from a grid tile: when the page closes it shrinks and fades into that tile (the grid recorded
 * where it was under `originKey`). A page opened any other way just uses the route's own fade.
 */
export function ZoomOutFrame({ originKey, children }: { originKey: string; children: ReactNode }) {
  const navigation = useNavigation();
  const rootRef = useRef<View>(null);
  const frame = useRef({ x: 0, y: 0, w: 1 });
  const exit = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const endScale = useSharedValue(1);
  // Once leaving has started the page ignores touches, so a second tap on Back during the close can't send a second
  // GO_BACK to a stack that has nothing left to go back to.
  const [closing, setClosing] = useState(false);
  const measure = () => rootRef.current?.measureInWindow((x, y, w) => (frame.current = { x, y, w: w || 1 }));

  useEffect(() => {
    if (!FOLDER_ZOOM) return;
    const start = () => {
      setClosing(true);
      const o = takeZoomOrigin(originKey);
      if (!o) return;
      originX.set(o.x - frame.current.x);
      originY.set(o.y - frame.current.y);
      endScale.set(Math.max(0.05, o.size / frame.current.w));
      exit.set(withTiming(1, { duration: SHRINK_MS, easing: Easing.out(Easing.cubic) }));
    };
    const nav = navigation as unknown as { addListener(e: string, cb: (ev: { data?: { closing?: boolean } }) => void): () => void };
    // `beforeRemove` fires the moment going back is dispatched (before the native transition starts), sooner than
    // `transitionStart`, so the shrink begins with the pop; `transitionStart` is the backup.
    const offBefore = nav.addListener('beforeRemove', start);
    const offTransition = nav.addListener('transitionStart', (e) => {
      if (e.data?.closing) start();
    });
    return () => {
      offBefore();
      offTransition();
    };
  }, [navigation, originKey, exit, originX, originY, endScale]);

  const shrinkStyle = useAnimatedStyle(() => {
    const p = exit.get();
    return { opacity: 1 - p * 0.6, transform: [{ scale: 1 + p * (endScale.get() - 1) }], transformOrigin: [originX.get(), originY.get(), 0] };
  });

  return (
    <Animated.View ref={rootRef} onLayout={measure} pointerEvents={closing ? 'none' : 'auto'} style={[styles.fill, shrinkStyle]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
