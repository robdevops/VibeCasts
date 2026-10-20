import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { Artwork } from '@/components/ui/artwork';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/store/settings';
import { usePlayer } from '@/store/player';

import { SkipIcon } from './skip-icon';

const openEpisode = () => router.push('/episode');

/** Persistent playback bar above the tab bar. Tap, or swipe up, to open the episode screen. */
export function MiniPlayer() {
  const theme = useTheme();
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const fraction = usePlayer((s) => (s.durationSec > 0 ? Math.min(1, s.positionSec / s.durationSec) : 0));
  const skipBack = useSettings((s) => s.skipBackSec);
  const skipForward = useSettings((s) => s.skipForwardSec);

  const swipeUp = Gesture.Pan()
    .activeOffsetY([-14, 14])
    .failOffsetX([-24, 24])
    .runOnJS(true)
    .onEnd((e) => {
      if (e.translationY < -40 || e.velocityY < -600) openEpisode();
    });

  if (!current) return null;
  const { episode, podcast } = current;

  return (
    <GestureDetector gesture={swipeUp}>
      <View style={[styles.card, { backgroundColor: theme.accentSoft }]}>
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Now playing: ${episode.title}. Open player`}
            onPress={openEpisode}
            style={styles.art}>
            <Artwork uri={episode.artwork ?? podcast.artwork} title={podcast.title} size={52} radius={8} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open player" onPress={openEpisode} style={styles.spacer}>
            <ThemedText type="small" numberOfLines={1} style={{ color: theme.textSecondary }}>
              {buffering && playing ? 'Buffering…' : podcast.title}
            </ThemedText>
            <ThemedText type="smallBold" numberOfLines={1}>
              {episode.title}
            </ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Skip back ${skipBack} seconds`} onPress={() => usePlayer.getState().skipBack()} hitSlop={6}>
            <SkipIcon direction="back" seconds={skipBack} size={32} color={theme.accent} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            onPress={() => usePlayer.getState().toggle()}
            style={[styles.play, { backgroundColor: theme.accent }]}>
            <Icon name={playing ? 'pause' : 'play-arrow'} size={30} color="#fff" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Skip forward ${skipForward} seconds`} onPress={() => usePlayer.getState().skipForward()} hitSlop={6}>
            <SkipIcon direction="forward" seconds={skipForward} size={32} color={theme.accent} />
          </Pressable>
        </View>
        {/* Thin progress line along the bottom edge. Display only: seeking happens on the player screen. */}
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no" style={styles.track}>
          <View style={[styles.trackBg, { backgroundColor: theme.accent }]} />
          <View style={[styles.fill, { backgroundColor: theme.accent, width: `${fraction * 100}%` }]} />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  // Square and full width, so the progress line is visible from its very start to its end.
  card: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8 },
  art: { borderRadius: 8 },
  spacer: { flex: 1, minWidth: 0 },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  track: { height: 3 },
  trackBg: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.3 },
  fill: { height: 3 },
});
