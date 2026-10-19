import * as Haptics from 'expo-haptics';
import { createContext, useContext, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { nextTab } from '@/lib/swipe-tabs';

type Props<T> = {
  tabs: readonly T[];
  tab: T;
  onTab: (t: T) => void;
  /** Wrap the seek bar (or any control that owns horizontal drags) so a swipe starting on it is ignored. */
  children: ReactNode;
};

const IgnoreContext = createContext<SharedValue<{ y: number; h: number }[]> | null>(null);

/** Horizontal slack above and below a control that still counts as "on" it. */
const SLACK = 12;

/**
 * Swipe left/right anywhere inside to change tab. Vertical movement fails the gesture, so
 * scrolling and the modal's swipe-down keep working; a swipe that starts inside a `SwipeIgnore`
 * area (the seek bar) is left to that control.
 */
export function SwipeTabs<T>({ tabs, tab, onTab, children }: Props<T>) {
  const ignoring = useSharedValue(false);
  const zones = useSharedValue<{ y: number; h: number }[]>([]);

  const swipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-12, 12])
    .runOnJS(true)
    .onBegin((e) => {
      ignoring.set(zones.get().some((z) => e.absoluteY >= z.y - SLACK && e.absoluteY <= z.y + z.h + SLACK));
    })
    .onEnd((e) => {
      if (ignoring.get()) return;
      const next = nextTab(tabs, tab, e.translationX, e.velocityX);
      if (next !== null) {
        onTab(next);
        Haptics.selectionAsync().catch(() => {});
      }
    });

  return (
    <GestureDetector gesture={swipe}>
      <View style={styles.fill} collapsable={false}>
        <IgnoreContext.Provider value={zones}>{children}</IgnoreContext.Provider>
      </View>
    </GestureDetector>
  );
}

/** Marks its children as a no-swipe area (they keep their own horizontal drag). */
export function SwipeIgnore({ children, style }: { children: ReactNode; style?: object }) {
  const zones = useContext(IgnoreContext);
  const ref = useRef<View>(null);
  const mine = useSharedValue<{ y: number; h: number } | null>(null);
  return (
    <View
      ref={ref}
      style={style}
      onLayout={() =>
        ref.current?.measureInWindow((_x, y, _w, h) => {
          if (!zones) return;
          const prev = mine.get();
          const rest = zones.get().filter((z) => z !== prev);
          const entry = { y, h };
          mine.set(entry);
          zones.set([...rest, entry]);
        })
      }>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
