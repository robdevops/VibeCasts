import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { HEADER_HEIGHT } from '@/components/ui/screen-header';
import { useTheme } from '@/hooks/use-theme';
import { contentHeight, metricsFor, nearCenter, slotAt, slotRect, visibleRange, type GridMetrics } from '@/lib/grid';
import { reorder } from '@/lib/layout';

export type GridItem = { key: string; kind: 'podcast' | 'folder' };

type Props = {
  items: GridItem[];
  renderItem: (item: GridItem, size: number) => ReactNode;
  onPress: (item: GridItem) => void;
  /** Persist a new order (full list of keys). */
  onReorder: (keys: string[]) => void;
  /** A podcast was dropped on a folder. */
  onDropIntoFolder?: (podcastKey: string, folderKey: string) => void;
  onRemove?: (key: string) => void;
  removeLabel?: string;
  canReorder?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  empty?: ReactNode;
  /** A drag began on this tile (after the long press). The parent may swap `items` in response; the drag carries on. */
  onDragBegin?: (key: string) => void;
  /** A drag ended, whatever the outcome. */
  onDragFinish?: () => void;
  /** The range of item indexes near the viewport changed (for loading what is on screen first). */
  onVisibleChange?: (range: { start: number; end: number }) => void;
};

type Drag = {
  key: string;
  startLeft: number;
  startTop: number;
  startScroll: number;
  tx: number;
  ty: number;
  absY: number;
};

export function TileGrid({
  items,
  renderItem,
  onPress,
  onReorder,
  onDropIntoFolder,
  onRemove,
  removeLabel = 'Remove',
  canReorder = true,
  refreshing = false,
  onRefresh,
  empty,
  onDragBegin,
  onDragFinish,
  onVisibleChange,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const m = useMemo(() => metricsFor(width), [width]);

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useSharedValue(0);
  const scrollNow = useRef(0);
  const contentH = useRef(0);
  const viewportH = useRef(0);

  const [order, setOrder] = useState<string[] | null>(null); // non-null while dragging
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [hoverFolder, setHoverFolder] = useState<string | null>(null);
  const [overRemove, setOverRemove] = useState(false);
  // Only tiles in (or near) view are mounted; [start, end) are indexes into the displayed order.
  const [win, setWin] = useState({ start: 0, end: 60 });

  const drag = useRef<Drag | null>(null);
  const orderRef = useRef<string[]>([]);
  const hoverRef = useRef<string | null>(null);
  const removeRef = useRef(false);
  const scrollDir = useRef(0);
  const dwell = useRef<{ key: string; since: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const displayKeys = order ?? items.map((i) => i.key);
  // Where each tile sits (its slot). The tiles themselves are always rendered in `items` order, so a
  // drag moves tiles by position only and never reorders the underlying views (reordering views
  // under an active touch can cancel it).
  const slotOf = useMemo(() => new Map(displayKeys.map((k, i) => [k, i])), [displayKeys]);

  const visibleCb = useRef(onVisibleChange);
  useEffect(() => {
    visibleCb.current = onVisibleChange;
  });
  const lastRange = useRef({ start: -1, end: -1 });

  const updateWindow = useCallback(
    (y: number) => {
      const next = visibleRange(y, viewportH.current || windowHeight, m, items.length);
      setWin((w) => (w.start === next.start && w.end === next.end ? w : next));
      if (next.start !== lastRange.current.start || next.end !== lastRange.current.end) {
        lastRange.current = next;
        visibleCb.current?.(next);
      }
    },
    [items.length, m, windowHeight],
  );
  useEffect(() => {
    updateWindow(scrollNow.current);
  }, [updateWindow]);

  const removeBottom = insets.top + HEADER_HEIGHT;

  const evaluate = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    const cx = d.startLeft + d.tx + m.tile / 2;
    const cy = d.startTop + d.ty + (scrollNow.current - d.startScroll) + m.tile / 2;
    const over = !!onRemove && d.absY < removeBottom;
    if (over !== removeRef.current) {
      removeRef.current = over;
      setOverRemove(over);
    }
    const keys = orderRef.current;
    const target = over ? -1 : slotAt(cx, cy, m, keys.length);
    const targetKey = target >= 0 ? keys[target] : undefined;
    const activeItem = byKey.get(d.key);
    let folderHover: string | null = null;
    if (
      targetKey &&
      targetKey !== d.key &&
      activeItem?.kind === 'podcast' &&
      byKey.get(targetKey)?.kind === 'folder' &&
      onDropIntoFolder &&
      nearCenter(cx, cy, slotRect(target, m))
    ) {
      folderHover = targetKey;
    }
    if (folderHover !== hoverRef.current) {
      hoverRef.current = folderHover;
      setHoverFolder(folderHover);
    }
    // A podcast hovering a folder's edge only reorders after a short dwell, so passing over a
    // folder on the way somewhere else doesn't push it aside before it can be dropped into.
    let settled = true;
    if (activeItem?.kind === 'podcast' && targetKey && byKey.get(targetKey)?.kind === 'folder' && onDropIntoFolder) {
      if (dwell.current?.key !== targetKey) dwell.current = { key: targetKey, since: Date.now() };
      settled = Date.now() - dwell.current.since >= DWELL_MS;
    } else {
      dwell.current = null;
    }
    if (canReorder && target >= 0 && !folderHover && settled) {
      const from = keys.indexOf(d.key);
      if (from !== target) {
        const next = reorder(keys, from, target);
        orderRef.current = next;
        setOrder(next);
      }
    }
    // Edge auto-scroll: just under the header, or above the bottom of the screen.
    scrollDir.current = over ? 0 : d.absY < removeBottom + 50 ? -1 : d.absY > windowHeight - 160 ? 1 : 0;
  }, [byKey, canReorder, m, onDropIntoFolder, onRemove, removeBottom, windowHeight]);

  // The list can be swapped while a drag is in progress (a search result being dragged brings up the
  // whole library). Keep the drag going: rebuild the working order from the new list, with the
  // dragged tile at the slot under the finger.
  useEffect(() => {
    const d = drag.current;
    if (!d) return;
    const keys = items.map((i) => i.key);
    const sameSet = keys.length === orderRef.current.length && keys.every((k) => orderRef.current.includes(k));
    if (sameSet || !keys.includes(d.key)) return;
    let next = keys;
    if (canReorder) {
      const cx = d.startLeft + d.tx + m.tile / 2;
      const cy = d.startTop + d.ty + (scrollNow.current - d.startScroll) + m.tile / 2;
      const target = slotAt(cx, cy, m, keys.length);
      if (target >= 0) next = reorder(keys, keys.indexOf(d.key), target);
    }
    orderRef.current = next;
    hoverRef.current = null;
    setHoverFolder(null);
    setOrder(next);
  }, [items, canReorder, m]);

  const stopTimer = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  const onDragStart = useCallback(
    (key: string, startLeft: number, startTop: number) => {
      const keys = items.map((i) => i.key);
      orderRef.current = keys;
      drag.current = { key, startLeft, startTop, startScroll: scrollNow.current, tx: 0, ty: 0, absY: 0 };
      hoverRef.current = null;
      removeRef.current = false;
      setOrder(keys);
      setActiveKey(key);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      onDragBegin?.(key);
      stopTimer();
      timer.current = setInterval(() => {
        if (dwell.current) evaluate();
        if (!scrollDir.current) return;
        const max = Math.max(0, contentH.current - viewportH.current);
        const next = Math.min(max, Math.max(0, scrollNow.current + scrollDir.current * 12));
        if (next === scrollNow.current) return;
        scrollRef.current?.scrollTo({ y: next, animated: false });
        scrollNow.current = next;
        scrollY.set(next);
        evaluate();
      }, 16);
    },
    [evaluate, items, onDragBegin, scrollY, stopTimer],
  );

  const onDragMove = useCallback(
    (tx: number, ty: number, absY: number) => {
      const d = drag.current;
      if (!d) return;
      d.tx = tx;
      d.ty = ty;
      d.absY = absY;
      evaluate();
    },
    [evaluate],
  );

  const onDragEnd = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    dwell.current = null;
    stopTimer();
    const keys = orderRef.current;
    const original = items.map((i) => i.key);
    if (removeRef.current) onRemove?.(d.key);
    else if (hoverRef.current) onDropIntoFolder?.(d.key, hoverRef.current);
    else if (keys.some((k, i) => k !== original[i])) onReorder(keys);
    removeRef.current = false;
    hoverRef.current = null;
    setOrder(null);
    setActiveKey(null);
    setHoverFolder(null);
    setOverRemove(false);
    onDragFinish?.();
  }, [items, onDragFinish, onDropIntoFolder, onRemove, onReorder, stopTimer]);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
    viewportH.current = e.nativeEvent.layout.height;
  };

  const height = contentHeight(items.length, m);
  useEffect(() => {
    contentH.current = height;
  }, [height]);

  // Gestures must keep a stable identity or an active drag is cancelled on re-render, so the
  // cells get wrappers that always call the latest handlers.
  const latest = useRef({ onPress, onDragStart, onDragMove, onDragEnd });
  useEffect(() => {
    latest.current = { onPress, onDragStart, onDragMove, onDragEnd };
  });
  const stable = useMemo(
    () => ({
      onPress: (item: GridItem) => latest.current.onPress(item),
      onDragStart: (key: string, left: number, top: number) => latest.current.onDragStart(key, left, top),
      onDragMove: (tx: number, ty: number, absY: number) => latest.current.onDragMove(tx, ty, absY),
      onDragEnd: () => latest.current.onDragEnd(),
    }),
    [],
  );
  const dragging = activeKey !== null;

  return (
    <View style={styles.fill} onLayout={onLayout}>
      <ScrollView
        ref={scrollRef}
        scrollEnabled={!dragging}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollNow.current = e.nativeEvent.contentOffset.y;
          scrollY.set(scrollNow.current);
          updateWindow(scrollNow.current);
        }}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} /> : undefined}
        contentContainerStyle={{ minHeight: height }}>
        {width > 0 && items.length > 0 ? (
          <View style={{ height, width }}>
            {items.map((item, natural) => {
              const key = item.key;
              const index = slotOf.get(key) ?? natural;
              if ((index < win.start || index >= win.end) && key !== activeKey) return null;
              return (
                <Cell
                  key={key}
                  item={item}
                  index={index}
                  m={m}
                  active={key === activeKey}
                  highlighted={key === hoverFolder}
                  scrollY={scrollY}
                  draggable={canReorder || !!onDropIntoFolder || !!onRemove}
                  onPress={stable.onPress}
                  onDragStart={stable.onDragStart}
                  onDragMove={stable.onDragMove}
                  onDragEnd={stable.onDragEnd}>
                  {renderItem(item, m.tile)}
                </Cell>
              );
            })}
          </View>
        ) : (
          empty
        )}
      </ScrollView>
      {dragging && onRemove ? (
        <View
          pointerEvents="none"
          style={[
            styles.remove,
            { height: removeBottom, paddingTop: insets.top, top: -removeBottom },
            { backgroundColor: overRemove ? theme.accent : theme.accentSoft },
          ]}>
          <Icon name="delete-outline" size={26} color={overRemove ? '#fff' : theme.accent} />
          <ThemedText type="smallBold" style={{ color: overRemove ? '#fff' : theme.accent }}>
            {removeLabel}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

type CellProps = {
  item: GridItem;
  index: number;
  m: GridMetrics;
  active: boolean;
  highlighted: boolean;
  draggable: boolean;
  scrollY: SharedValue<number>;
  onPress: (item: GridItem) => void;
  onDragStart: (key: string, left: number, top: number) => void;
  onDragMove: (tx: number, ty: number, absY: number) => void;
  onDragEnd: () => void;
  children: ReactNode;
};

function Cell({ item, index, m, active, highlighted, draggable, scrollY, onPress, onDragStart, onDragMove, onDragEnd, children }: CellProps) {
  const rect = slotRect(index, m);
  const x = useSharedValue(rect.left);
  const y = useSharedValue(rect.top);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startScroll = useSharedValue(0);
  const startLeft = useSharedValue(0);
  const startTop = useSharedValue(0);
  const wasActive = useRef(false);

  useEffect(() => {
    if (active) {
      wasActive.current = true;
      return;
    }
    if (wasActive.current) {
      // Released: start the settle animation from where the finger left the tile.
      wasActive.current = false;
      x.set(startLeft.value + tx.value);
      y.set(startTop.value + ty.value + (scrollY.value - startScroll.value));
    }
    x.set(withTiming(rect.left, { duration: 180 }));
    y.set(withTiming(rect.top, { duration: 180 }));
  }, [active, rect.left, rect.top, x, y, tx, ty, startLeft, startTop, startScroll, scrollY]);

  const style = useAnimatedStyle(() => {
    if (active) {
      return {
        left: startLeft.value + tx.value,
        top: startTop.value + ty.value + (scrollY.value - startScroll.value),
        zIndex: 20,
        opacity: 0.92,
        transform: [{ scale: 1.07 }],
      };
    }
    return { left: x.value, top: y.value, zIndex: 0, opacity: 1, transform: [{ scale: highlighted ? 1.12 : 1 }] };
  });

  const itemKey = item.key;
  const itemKind = item.kind;
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(draggable)
      .activateAfterLongPress(350)
      .onStart(() => {
        startLeft.set(x.value);
        startTop.set(y.value);
        startScroll.set(scrollY.value);
        tx.set(0);
        ty.set(0);
        scheduleOnRN(onDragStart, itemKey, x.value, y.value);
      })
      .onUpdate((e) => {
        tx.set(e.translationX);
        ty.set(e.translationY);
        scheduleOnRN(onDragMove, e.translationX, e.translationY, e.absoluteY);
      })
      .onFinalize(() => {
        scheduleOnRN(onDragEnd);
      });

    const tap = Gesture.Tap()
      .maxDuration(300)
      .runOnJS(true)
      .onEnd((_e, success) => {
        if (success) onPress({ key: itemKey, kind: itemKind });
      });

    return Gesture.Race(pan, tap);
  }, [draggable, itemKey, itemKind, onDragEnd, onDragMove, onDragStart, onPress, scrollY, startLeft, startScroll, startTop, tx, ty, x, y]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.cell, { width: m.tile, height: m.tile }, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}

/** How long a dragged podcast must rest on a folder's edge before the folder makes way. */
const DWELL_MS = 350;

const styles = StyleSheet.create({
  fill: { flex: 1, zIndex: 10 },
  cell: { position: 'absolute' },
  remove: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    zIndex: 50,
  },
});
