import { useEffect } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { usePlayer } from '@/store/player';

import { EpisodeView } from './episode-screen';
import { closePlayerSheet, setSheetOpen, sheetProgress, usePlayerSheet } from './sheet-state';

/** The full player, always mounted while something is loaded, sliding over the whole app. */
export function PlayerSheet() {
  const hasCurrent = usePlayer((s) => !!s.current);
  const open = usePlayerSheet((s) => s.open);
  const { height } = useWindowDimensions();

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - sheetProgress.get()) * height }] }));

  // Android back closes the player first.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closePlayerSheet();
      return true;
    });
    return () => sub.remove();
  }, [open]);

  // Nothing loaded (e.g. the episode was cleared): make sure it is closed.
  useEffect(() => {
    if (!hasCurrent) {
      sheetProgress.set(0);
      setSheetOpen(false);
    }
  }, [hasCurrent]);

  if (!hasCurrent) return null;
  return (
    <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[styles.sheet, style]}>
      <EpisodeView onClose={closePlayerSheet} sheet />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 100 },
});
