import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { usePlayer } from '@/store/player';

import { EpisodeView } from './episode-screen';
import { MiniPlayerView } from './mini-player';
import { closePlayerSheet, miniTop, setSheetOpen, sheetProgress, usePlayerSheet, usePlayerSheetDrag } from './sheet-state';

/**
 * The mini player and the full player are one overlay. At rest it is the small strip above the tab
 * bar; dragging it up slides the whole card up to fill the screen, the strip fading into the
 * player's header as it goes.
 */
export function PlayerSheet() {
  const hasCurrent = usePlayer((s) => !!s.current);
  const open = usePlayerSheet((s) => s.open);
  const { height } = useWindowDimensions();
  const drag = usePlayerSheetDrag();
  // Browsing another episode (the /episode screen) has its own play button at the bottom: the mini
  // player would sit on top of it, so it steps out of the way until you come back.
  const hidden = usePathname() === '/episode' && !open;

  // The card's top edge: the mini player's spot at progress 0, the top of the screen at 1.
  const card = useAnimatedStyle(() => ({ transform: [{ translateY: (miniTop.get() || height) * (1 - sheetProgress.get()) }] }));
  // The player body is solid from early in the drag; the strip fades out as the player arrives.
  const body = useAnimatedStyle(() => ({ opacity: Math.min(1, sheetProgress.get() * 5) }));
  const strip = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, sheetProgress.get() * 3) }));

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
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[styles.sheet, card, hidden ? styles.hidden : null]}>
      <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[styles.body, body]}>
        <EpisodeView onClose={closePlayerSheet} sheet />
      </Animated.View>
      <GestureDetector gesture={drag}>
        <Animated.View pointerEvents={open ? 'none' : 'auto'} style={[styles.strip, strip]}>
          <MiniPlayerView />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%', zIndex: 100 },
  body: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  strip: { position: 'absolute', left: 0, right: 0, top: 0 },
  hidden: { opacity: 0 },
});
