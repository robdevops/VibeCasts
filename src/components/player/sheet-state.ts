import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { Easing, makeMutable, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { create } from 'zustand';

/** 0 = the player is closed (only the mini player shows), 1 = fully open. Follows the finger while dragging. */
export const sheetProgress = makeMutable(0);

/**
 * Where the mini player sits (window y of its top edge, and its height). The sheet is the mini
 * player: at progress 0 its top edge is here, and it travels up to the top of the screen. 0 until
 * measured.
 */
export const miniTop = makeMutable(0);
export const useMiniHeight = create<{ height: number }>(() => ({ height: 0 }));
export const setMiniLayout = (top: number, height: number) => {
  miniTop.set(top);
  useMiniHeight.setState({ height });
};

/** Is the player settled open? (For the Android back button and touch handling.) */
export const usePlayerSheet = create<{ open: boolean }>(() => ({ open: false }));

export const setSheetOpen = (open: boolean) => usePlayerSheet.setState({ open });

const TIMING = { duration: 260, easing: Easing.out(Easing.cubic) };

export function openPlayerSheet() {
  setSheetOpen(true);
  sheetProgress.set(withTiming(1, TIMING));
}

export function closePlayerSheet() {
  setSheetOpen(false);
  sheetProgress.set(withTiming(0, TIMING));
}

/** Past this much of the way up (the top half of the screen) a release opens the player; otherwise it springs back. */
const OPEN_THRESHOLD = 0.5;
const FLICK_VELOCITY = 1000;

/**
 * Drag the player up or down in real time. Used on the mini player (to pull the player up) and on
 * the player's header (to push it down). Releasing past the halfway point settles it open,
 * otherwise it snaps back; a fast flick decides the direction regardless.
 */
export function usePlayerSheetDrag() {
  const { height } = useWindowDimensions();
  const startProgress = useSharedValue(0);
  return useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-30, 30])
        .onStart(() => {
          startProgress.set(sheetProgress.get());
        })
        .onUpdate((e) => {
          // The card follows the finger one for one: it travels from the mini player's spot to the top.
          const travel = Math.max(1, miniTop.get() || height);
          sheetProgress.set(Math.min(1, Math.max(0, startProgress.get() - e.translationY / travel)));
        })
        .onEnd((e) => {
          const p = sheetProgress.get();
          const goOpen = e.velocityY < -FLICK_VELOCITY ? true : e.velocityY > FLICK_VELOCITY ? false : p > OPEN_THRESHOLD;
          sheetProgress.set(withTiming(goOpen ? 1 : 0, TIMING));
          scheduleOnRN(setSheetOpen, goOpen);
        }),
    [height, startProgress],
  );
}
