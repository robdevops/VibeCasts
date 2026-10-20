import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  Easing,
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
import { contentHeight, metricsFor, mountedRange, nearCenter, slotAt, slotRect, tileAt, visibleRange, type GridMetrics } from '@/lib/grid';
import { FOLDER_ZOOM, SHRINK_MS, pushZoomOrigin, ZOOM_MS } from '@/lib/folder-zoom';
import { useFlight } from '@/store/flight';
import { parseKey, reorder } from '@/lib/layout';

export type GridItem = { key: string; kind: 'podcast' | 'folder' };

type Props = {
  items: GridItem[];
  renderItem: (item: GridItem, size: number) => ReactNode;
  /**
   * A value that changes when what a tile shows changes (title, art, badge...). Tiles re-render only
   * when their slot, drag state or this version changes, not on every scroll or reorder.
   */
  itemVersion?: (item: GridItem) => string | number;
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
  /** What a tapped podcast tile shows (its artwork and title), so the artwork can fly to the show's page. */
  flightInfo?: (item: GridItem) => { uri?: string; title: string } | undefined;
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
  itemVersion,
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
  flightInfo,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const m = useMemo(() => metricsFor(width), [width]);

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useSharedValue(0);
  // Tiles are plain views and one gesture on the whole grid works out which tile is under the finger. The dragged
  // tile is drawn as a "ghost" that follows the finger (these values), while its own slot is hidden.
  const dragTx = useSharedValue(0);
  const dragTy = useSharedValue(0);
  const dragStartScroll = useSharedValue(0);
  const dragStartLeft = useSharedValue(0);
  const dragStartTop = useSharedValue(0);
  const downX = useSharedValue(0);
  const downY = useSharedValue(0);
  const started = useSharedValue(false);
  const ghostSettling = useSharedValue(false);
  const ghostX = useSharedValue(0);
  const ghostY = useSharedValue(0);
  // Opening a folder zooms the grid towards you (about the tapped tile) while it fades out; coming back reverses it.
  const zoom = useSharedValue(0);
  const [zoomKey, setZoomKey] = useState<string | null>(null); // the folder being opened (its tile is drawn as a zooming copy)
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<View>(null);
  const focused = useIsFocused();
  const flightKey = useFlight((st) => (st.phase === 'idle' ? null : st.key)); // the show whose artwork is flying: its tile is empty meanwhile
  const scrollNow = useRef(0);
  const contentH = useRef(0);
  const viewportH = useRef(0);

  const [order, setOrder] = useState<string[] | null>(null); // non-null while dragging
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [ghostKey, setGhostKey] = useState<string | null>(null); // the dragged tile's ghost stays until it has settled into its slot
  const ghostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      // Keep recently visible tiles mounted (only let go of far-away ones): remounting makes art flash.
      setWin((w) => {
        const merged = mountedRange(w, next, m.cols);
        return merged.start === w.start && merged.end === w.end ? w : merged;
      });
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
    (downLeft: number, downTop: number) => {
      const keys = items.map((i) => i.key);
      const at = tileAt(downLeft, downTop, m, keys.length);
      if (at < 0) return; // the press began on a gap, not a tile
      const key = keys[at];
      const rect = slotRect(at, m);
      orderRef.current = keys;
      drag.current = { key, startLeft: rect.left, startTop: rect.top, startScroll: scrollNow.current, tx: 0, ty: 0, absY: 0 };
      dragStartLeft.set(rect.left);
      dragStartTop.set(rect.top);
      dragStartScroll.set(scrollNow.current);
      dragTx.set(0);
      dragTy.set(0);
      ghostSettling.set(false);
      if (ghostTimer.current) clearTimeout(ghostTimer.current);
      hoverRef.current = null;
      removeRef.current = false;
      setOrder(keys);
      setActiveKey(key);
      setGhostKey(key);
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
    [dragStartLeft, dragStartScroll, dragStartTop, dragTx, dragTy, evaluate, ghostSettling, items, m, onDragBegin, scrollY, stopTimer],
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
    const gone = removeRef.current || !!hoverRef.current;
    if (removeRef.current) onRemove?.(d.key);
    else if (hoverRef.current) onDropIntoFolder?.(d.key, hoverRef.current);
    else if (keys.some((k, i) => k !== original[i])) onReorder(keys);
    // The ghost glides from where the finger left it into its slot, then the real tile takes over.
    const dest = keys.indexOf(d.key);
    if (gone || dest < 0) {
      setGhostKey(null);
    } else {
      const rect = slotRect(dest, m);
      ghostX.set(d.startLeft + d.tx);
      ghostY.set(d.startTop + d.ty + (scrollNow.current - d.startScroll));
      ghostSettling.set(true);
      ghostX.set(withTiming(rect.left, { duration: 180 }));
      ghostY.set(withTiming(rect.top, { duration: 180 }));
      if (ghostTimer.current) clearTimeout(ghostTimer.current);
      ghostTimer.current = setTimeout(() => setGhostKey(null), 200);
    }
    removeRef.current = false;
    hoverRef.current = null;
    setOrder(null);
    setActiveKey(null);
    setHoverFolder(null);
    setOverRemove(false);
    onDragFinish?.();
  }, [ghostSettling, ghostX, ghostY, items, m, onDragFinish, onDropIntoFolder, onRemove, onReorder, stopTimer]);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
    viewportH.current = e.nativeEvent.layout.height;
  };

  const height = contentHeight(items.length, m);
  useEffect(() => {
    contentH.current = height;
  }, [height]);

  // The grid gesture must keep a stable identity or an active drag is cancelled on re-render, so it calls the
  // latest handlers through this ref.
  const pressAt = (x: number, y: number) => {
    const keys = order ?? items.map((i) => i.key);
    const at = tileAt(x, y, m, keys.length);
    const item = at >= 0 ? byKey.get(keys[at]) : undefined;
    if (FOLDER_ZOOM && item) {
      const rect = slotRect(at, m);
      const scroll = scrollNow.current;
      if (item.kind === 'folder') {
        // A folder: its tile zooms towards you, and the folder page shrinks back into it when it closes.
        if (zoomTimer.current) clearTimeout(zoomTimer.current);
        zoom.set(0);
        setZoomKey(item.key);
        zoom.set(withTiming(1, { duration: ZOOM_MS }));
        const key = `folder:${parseKey(item.key).id}`;
        rootRef.current?.measureInWindow((x, y) =>
          pushZoomOrigin({ key, x: x + rect.left + m.tile / 2, y: y + rect.top + m.tile / 2 - scroll, size: m.tile }),
        );
      } else {
        // A show: its artwork flies from the tile to the artwork on the show's page, and back when the page closes.
        const info = flightInfo?.(item);
        if (info) {
          const key = `podcast:${parseKey(item.key).id}`;
          rootRef.current?.measureInWindow((x, y) =>
            useFlight.getState().begin(key, info.uri, info.title, { x: x + rect.left, y: y + rect.top - scroll, size: m.tile }),
          );
        }
      }
    }
    if (item) onPress(item);
  };
  const latest = useRef({ pressAt, onDragStart, onDragMove, onDragEnd });
  useEffect(() => {
    latest.current = { pressAt, onDragStart, onDragMove, onDragEnd };
  });
  const stable = useMemo(
    () => ({
      pressAt: (x: number, y: number) => latest.current.pressAt(x, y),
      onDragStart: (x: number, y: number) => latest.current.onDragStart(x, y),
      onDragMove: (tx: number, ty: number, absY: number) => latest.current.onDragMove(tx, ty, absY),
      onDragEnd: () => latest.current.onDragEnd(),
    }),
    [],
  );
  const draggable = canReorder || !!onDropIntoFolder || !!onRemove;
  const gesture = useGridGesture({
    draggable,
    downX,
    downY,
    dragTx,
    dragTy,
    started,
    onDragStart: stable.onDragStart,
    onDragMove: stable.onDragMove,
    onDragEnd: stable.onDragEnd,
    onTap: stable.pressAt,
  });

  const ghostStyle = useAnimatedStyle(() => {
    if (ghostSettling.get()) return { left: ghostX.get(), top: ghostY.get(), opacity: 1, transform: [{ scale: 1 }] };
    return {
      left: dragStartLeft.get() + dragTx.get(),
      top: dragStartTop.get() + dragTy.get() + (scrollY.get() - dragStartScroll.get()),
      opacity: 0.92,
      transform: [{ scale: 1.07 }],
    };
  });
  // Back from the folder: the tile zooms back into place, then the copy goes away. Only after this screen has really been
  // left (focus lost) and then regained: while the tap that started the zoom is still on this screen it must not run.
  const wasAway = useRef(false);
  useEffect(() => {
    if (!FOLDER_ZOOM || zoomKey === null) return;
    if (!focused) {
      wasAway.current = true;
      return;
    }
    if (!wasAway.current) return;
    wasAway.current = false;
    zoom.set(withTiming(0, { duration: SHRINK_MS, easing: Easing.out(Easing.cubic) }));
    zoomTimer.current = setTimeout(() => setZoomKey(null), SHRINK_MS + 30);
    return () => {
      if (zoomTimer.current) clearTimeout(zoomTimer.current);
    };
  }, [focused, zoomKey, zoom]);
  // If the folder never opened (the screen was never left), put the tile back rather than leave it hidden.
  useEffect(() => {
    if (zoomKey === null) return;
    const t = setTimeout(() => {
      if (!wasAway.current && focused) {
        zoom.set(withTiming(0, { duration: 200 }));
        setZoomKey(null);
      }
    }, ZOOM_MS + 1500);
    return () => clearTimeout(t);
  }, [zoomKey, focused, zoom]);
  // Safety net: this screen is back on top but a flight is still marked "open" (the page closed without reporting it), so
  // hand the tile back rather than leave it empty.
  useEffect(() => {
    if (focused && flightKey !== null && useFlight.getState().phase === 'open') useFlight.getState().end();
  }, [focused, flightKey]);
  const zoomStyle = useAnimatedStyle(() => {
    const z = zoom.get();
    return { opacity: 1 - z, transform: [{ scale: 1 + z * 4 }] };
  });
  const zoomItem = zoomKey ? byKey.get(zoomKey) : undefined;
  const zoomIndex = zoomKey ? (slotOf.get(zoomKey) ?? -1) : -1;
  const ghostItem = ghostKey ? byKey.get(ghostKey) : undefined;
  const dragging = activeKey !== null;

  return (
    <View ref={rootRef} style={styles.fill} onLayout={onLayout}>
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
          <GestureDetector gesture={gesture}>
            <View collapsable={false} style={{ height, width }}>
              {items.map((item, natural) => {
                const key = item.key;
                const index = slotOf.get(key) ?? natural;
                if ((index < win.start || index >= win.end) && key !== ghostKey && key !== zoomKey) return null;
                return (
                  <Tile
                    key={key}
                    item={item}
                    index={index}
                    m={m}
                    hidden={key === ghostKey || key === zoomKey || (flightKey !== null && flightKey === `${item.kind}:${parseKey(key).id}`)}
                    highlighted={key === hoverFolder}
                    renderItem={renderItem}
                    version={itemVersion ? itemVersion(item) : 0}
                  />
                );
              })}
              {zoomItem && zoomIndex >= 0 ? (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.cell, { left: slotRect(zoomIndex, m).left, top: slotRect(zoomIndex, m).top, width: m.tile, height: m.tile, zIndex: 30 }, zoomStyle]}>
                  {renderItem(zoomItem, m.tile)}
                </Animated.View>
              ) : null}
              {ghostItem ? (
                <Animated.View pointerEvents="none" style={[styles.cell, { width: m.tile, height: m.tile, zIndex: 20 }, ghostStyle]}>
                  {renderItem(ghostItem, m.tile)}
                </Animated.View>
              ) : null}
            </View>
          </GestureDetector>
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
            { backgroundColor: overRemove ? theme.danger : theme.dangerSoft },
          ]}>
          <Icon name="delete-outline" size={26} color={overRemove ? '#fff' : theme.danger} />
          <ThemedText type="smallBold" style={{ color: overRemove ? '#fff' : theme.danger }}>
            {removeLabel}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

type GridGestureArgs = {
  draggable: boolean;
  downX: SharedValue<number>;
  downY: SharedValue<number>;
  dragTx: SharedValue<number>;
  dragTy: SharedValue<number>;
  started: SharedValue<boolean>;
  onDragStart: (x: number, y: number) => void;
  onDragMove: (tx: number, ty: number, absY: number) => void;
  onDragEnd: () => void;
  onTap: (x: number, y: number) => void;
};

/** One gesture for the whole grid: a tap, or a long press then drag, on whichever tile is under the finger. */
function useGridGesture({ draggable, downX, downY, dragTx, dragTy, started, onDragStart, onDragMove, onDragEnd, onTap }: GridGestureArgs) {
  return useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(draggable)
      .activateAfterLongPress(350)
      .onBegin((e) => {
        downX.set(e.x);
        downY.set(e.y);
      })
      .onStart(() => {
        started.set(true);
        scheduleOnRN(onDragStart, downX.get(), downY.get());
      })
      .onUpdate((e) => {
        dragTx.set(e.translationX);
        dragTy.set(e.translationY);
        scheduleOnRN(onDragMove, e.translationX, e.translationY, e.absoluteY);
      })
      .onFinalize(() => {
        if (!started.get()) return;
        started.set(false);
        scheduleOnRN(onDragEnd);
      });
    const tap = Gesture.Tap()
      .maxDuration(300)
      .runOnJS(true)
      .onEnd((e, success) => {
        if (success) onTap(e.x, e.y);
      });
    return Gesture.Race(pan, tap);
  }, [draggable, downX, downY, dragTx, dragTy, started, onDragStart, onDragMove, onDragEnd, onTap]);
}

type TileProps = {
  item: GridItem;
  index: number;
  m: GridMetrics;
  /** The dragged tile's slot: its ghost is drawn on top instead. */
  hidden: boolean;
  highlighted: boolean;
  renderItem: (item: GridItem, size: number) => ReactNode;
  version: string | number;
};

/** Re-render a tile only when something it shows has changed. */
const sameTile = (a: TileProps, b: TileProps) =>
  a.item.key === b.item.key &&
  a.item.kind === b.item.kind &&
  a.index === b.index &&
  a.m.tile === b.m.tile &&
  a.m.cols === b.m.cols &&
  a.m.gap === b.m.gap &&
  a.m.pad === b.m.pad &&
  a.hidden === b.hidden &&
  a.highlighted === b.highlighted &&
  // `renderItem` is deliberately not compared: it is new on every render, and a tile only re-renders when its `version`
  // (what it shows) changes, in which case it must draw with the renderItem of THIS render. Reading it through a ref that
  // is updated in an effect would hand the tile the previous render's data, so a recoloured folder or a new member
  // would not show until the next change.
  a.version === b.version;

/** A tile is just a positioned view (no gesture, no animated values): cheap to mount. It glides when its slot changes. */
const Tile = memo(function TileBase({ item, index, m, hidden, highlighted, renderItem }: TileProps) {
  const rect = slotRect(index, m);
  return (
    <Animated.View
      style={[
        styles.cell,
        {
          left: rect.left,
          top: rect.top,
          width: m.tile,
          height: m.tile,
          opacity: hidden ? 0 : 1,
          transform: [{ scale: highlighted ? 1.12 : 1 }],
          transitionProperty: ['left', 'top', 'transform'],
          transitionDuration: 180,
        },
      ]}>
      {renderItem(item, m.tile)}
    </Animated.View>
  );
}, sameTile);

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
