import { router, useNavigation } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** How long the page takes to slide up, and to slide back down. */
export const SLIDE_IN_MS = 200;
export const SLIDE_OUT_MS = 170;
/** A little longer than the slide out: wait this long after closing before navigating somewhere else. */
export const AFTER_CLOSE_MS = SLIDE_OUT_MS + 40;

/** Drag distance (px) or fling speed (px/s) that counts as "dismiss". */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 700;

const DismissContext = createContext<GestureType | null>(null);

/** The drag-down-to-dismiss gesture of the surrounding `SlideUpFrame`: attach it (GestureDetector) to the part of the page that should drag it. */
export function useSlideDismissGesture(): GestureType | null {
  return useContext(DismissContext);
}

/**
 * A page that slides up from the bottom, can be dragged down to dismiss, and slides back down when it closes, with
 * timings we control (the native modal transition's duration can't be changed: it is the system's). The route must use
 * `presentation: 'transparentModal'` and `animation: 'none'`, so the page underneath stays visible while this one slides.
 *
 * Closing (the close button, Back, a drag) is intercepted: the first removal is held back until the slide down has
 * finished, then the same action is dispatched again. Anything that navigates elsewhere right after closing must wait
 * `AFTER_CLOSE_MS`.
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

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);

  const dismiss = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(12)
        .failOffsetX([-24, 24])
        .onUpdate((e) => {
          y.set(Math.max(0, e.translationY));
        })
        .onEnd((e) => {
          if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
            scheduleOnRN(close);
          } else {
            y.set(withSpring(0, { damping: 22, stiffness: 260 }));
          }
        }),
    [y, close],
  );

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return (
    <DismissContext.Provider value={dismiss}>
      <Animated.View pointerEvents={closing ? 'none' : 'auto'} style={[styles.fill, style]}>
        {children}
      </Animated.View>
    </DismissContext.Provider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
