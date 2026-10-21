import * as Haptics from 'expo-haptics';
import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** A no-swipe area, in the pager's own coordinates (so it stays right while the player slides). */
type Zone = { y: number; h: number };

const IgnoreContext = createContext<{ zones: SharedValue<Zone[]>; container: RefObject<View | null> } | null>(null);

/** Horizontal slack above and below a control that still counts as "on" it. */
const SLACK = 12;
const SETTLE = { duration: 240, easing: Easing.out(Easing.cubic) };
/** How far ahead of the finger a flick carries the page (seconds of velocity). */
const FLING = 0.18;

type Props<T extends string> = {
  tabs: readonly T[];
  tab: T;
  onTab: (t: T) => void;
  panels: Record<T, ReactNode>;
  /** Shared horizontal offset (0 .. -(n-1)*width), so the tab labels can follow the pager live. */
  x: SharedValue<number>;
};

/**
 * Tabs laid out side by side that follow your finger, then settle on the nearest page (like a
 * pager). A swipe that starts on a `SwipeIgnore` area (the seek bar) is left to that control, and
 * vertical movement fails the gesture so panels still scroll.
 */
export function TabPager<T extends string>({ tabs, tab, onTab, panels, x }: Props<T>) {
  const { width } = useWindowDimensions();
  const index = Math.max(0, tabs.indexOf(tab));
  const last = tabs.length - 1;

  const start = useSharedValue(0);
  // The page the gesture is already settling on, so the state update that follows doesn't restart the animation.
  const settlingOn = useSharedValue(index);
  // What was last committed, so back-to-back swipes (before React re-renders) still tick once per change.
  const committed = useSharedValue(index);
  const ignoring = useSharedValue(false);
  const zones = useSharedValue<Zone[]>([]);
  const container = useRef<View>(null);

  // Start on the right page (the offset is owned by the caller).
  useEffect(() => {
    x.set(-index * width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A tab change from elsewhere (tapping the header) slides there too.
  useEffect(() => {
    committed.set(index);
    if (settlingOn.get() === index) return;
    settlingOn.set(index);
    x.set(withTiming(-index * width, SETTLE));
  }, [index, width, x, settlingOn, committed]);

  const commit = (i: number) => onTab(tabs[i]);
  const tick = () => {
    Haptics.selectionAsync().catch(() => {});
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-12, 12])
    .onBegin((e) => {
      cancelAnimation(x); // grab the page even while it is still settling from the last swipe
      // A plain loop: inline arrow functions inside a worklet get hoisted out and can't run on the UI thread.
      ignoring.set(false);
      const zs = zones.get();
      for (let i = 0; i < zs.length; i++) {
        if (e.y >= zs[i].y - SLACK && e.y <= zs[i].y + zs[i].h + SLACK) ignoring.set(true);
      }
      start.set(x.get());
    })
    .onUpdate((e) => {
      if (ignoring.get()) return;
      x.set(Math.min(0, Math.max(-last * width, start.get() + e.translationX)));
    })
    .onEnd((e) => {
      if (ignoring.get()) return;
      const projected = x.get() + e.velocityX * FLING;
      // A fast flick moves one tab, never two: stay within one page of where the drag began.
      const from = Math.round(-start.get() / width);
      const target = Math.min(last, from + 1, Math.max(0, from - 1, Math.round(-projected / width)));
      settlingOn.set(target);
      x.set(withTiming(-target * width, SETTLE));
      if (target !== committed.get()) {
        committed.set(target);
        scheduleOnRN(tick);
      }
      scheduleOnRN(commit, target);
    });

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <GestureDetector gesture={pan}>
      <View ref={container} style={styles.clip} collapsable={false}>
        <IgnoreContext.Provider value={{ zones, container }}>
          <Animated.View style={[styles.row, { width: width * tabs.length }, style]}>
            {tabs.map((t) => (
              <View key={t} style={{ width }}>
                {panels[t]}
              </View>
            ))}
          </Animated.View>
        </IgnoreContext.Provider>
      </View>
    </GestureDetector>
  );
}

/** Marks its children as a no-swipe area (they keep their own horizontal drag). */
export function SwipeIgnore({ children, style }: { children: ReactNode; style?: object }) {
  const ctx = useContext(IgnoreContext);
  const ref = useRef<View>(null);
  const mine = useSharedValue<Zone | null>(null);
  return (
    <View
      ref={ref}
      style={style}
      onLayout={() =>
        ctx?.container.current &&
        ref.current?.measureLayout(ctx.container.current, (_x, y, _w, h) => {
          const prev = mine.get();
          const entry = { y, h };
          mine.set(entry);
          ctx.zones.set([...ctx.zones.get().filter((z) => z !== prev), entry]);
        })
      }>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { flex: 1, overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
});
