import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/** How long the page takes to slide up, and to slide back down. */
export const SLIDE_IN_MS = 200;
export const SLIDE_OUT_MS = 170;
/** A little longer than the slide out: wait this long after closing before navigating somewhere else. */
export const AFTER_CLOSE_MS = SLIDE_OUT_MS + 40;

/**
 * A page that slides up from the bottom and slides back down when it closes, with timings we control (the native modal
 * transition's duration can't be changed: it is the system's). The route must use `presentation: 'transparentModal'` and
 * `animation: 'none'`, so the page underneath stays visible while this one slides over it.
 *
 * Closing is intercepted: the first removal is held back until the slide down has finished, then the same action is
 * dispatched again. Anything that navigates elsewhere right after closing must wait `AFTER_CLOSE_MS`.
 */
export function SlideUpFrame({ children }: { children: ReactNode }) {
  const navigation = useNavigation();
  const { height } = useWindowDimensions();
  const y = useSharedValue(height);
  const leaving = useRef(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    y.set(withTiming(0, { duration: SLIDE_IN_MS, easing: Easing.out(Easing.cubic) }));
  }, [y]);

  useEffect(() => {
    const nav = navigation as unknown as {
      addListener(e: string, cb: (ev: { preventDefault(): void; data: { action: unknown } }) => void): () => void;
      dispatch(action: unknown): void;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = nav.addListener('beforeRemove', (e) => {
      if (leaving.current) return; // our own second dispatch
      e.preventDefault();
      leaving.current = true;
      setClosing(true);
      y.set(withTiming(height, { duration: SLIDE_OUT_MS, easing: Easing.in(Easing.cubic) }));
      timer = setTimeout(() => nav.dispatch(e.data.action), SLIDE_OUT_MS);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [navigation, y, height]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return (
    <Animated.View pointerEvents={closing ? 'none' : 'auto'} style={[styles.fill, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
