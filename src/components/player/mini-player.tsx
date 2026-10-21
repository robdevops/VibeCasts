import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Artwork } from '@/components/ui/artwork';
import { GlowPressable } from '@/components/ui/glow-pressable';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/store/settings';
import { usePlayer } from '@/store/player';

import { openPlayerSheet, setMiniLayout } from './sheet-state';
import { SkipIcon } from './skip-icon';

const openEpisode = openPlayerSheet;

/**
 * The mini player as it looks. The visible one lives in the player sheet (so it can slide up and
 * become the full player); `MiniPlayer` below only reserves its space in the layout.
 */
export function MiniPlayerView() {
  const theme = useTheme();
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const skipBack = useSettings((s) => s.skipBackSec);
  const skipForward = useSettings((s) => s.skipForwardSec);

  if (!current) return null;
  const { episode, podcast } = current;

  return (
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
          <GlowPressable
            accessibilityRole="button"
            accessibilityLabel={`Skip back ${skipBack} seconds`}
            onPress={() => usePlayer.getState().skipBack()}
            hitSlop={6}
            glowColor={theme.accent}
            glowSize={44}
            tiltDeg={-35}>
            <SkipIcon direction="back" seconds={skipBack} size={32} color={theme.accent} />
          </GlowPressable>
          <GlowPressable
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            onPress={() => usePlayer.getState().toggle()}
            glowColor={theme.accent}
            glowSize={64}
            pressedScale={0.88}
            style={styles.playBox}>
            <View style={[styles.play, { backgroundColor: theme.accent }]}>
              <Icon name={playing ? 'pause' : 'play-arrow'} size={30} color="#fff" />
            </View>
          </GlowPressable>
          <GlowPressable
            accessibilityRole="button"
            accessibilityLabel={`Skip forward ${skipForward} seconds`}
            onPress={() => usePlayer.getState().skipForward()}
            hitSlop={6}
            glowColor={theme.accent}
            glowSize={44}
            tiltDeg={35}>
            <SkipIcon direction="forward" seconds={skipForward} size={32} color={theme.accent} />
          </GlowPressable>
        </View>
        {/* Thin progress line along the bottom edge. Display only: seeking happens on the player screen. */}
        <ProgressLine />
      </View>
  );
}

/** Its own component so only this line re-renders on each position tick, not the whole mini player. */
function ProgressLine() {
  const theme = useTheme();
  const fraction = usePlayer((s) => (s.durationSec > 0 ? Math.min(1, s.positionSec / s.durationSec) : 0));
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no" style={styles.track}>
      <View style={[styles.trackBg, { backgroundColor: theme.accent }]} />
      <View style={[styles.fill, { backgroundColor: theme.accent, width: `${fraction * 100}%` }]} />
    </View>
  );
}

/** Invisible stand-in in the tab bar: keeps the layout, and tells the sheet where the mini player sits. */
export function MiniPlayer() {
  const hasCurrent = usePlayer((s) => !!s.current);
  const ref = useRef<View>(null);
  if (!hasCurrent) return null;
  return (
    <View
      ref={ref}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={styles.placeholder}
      onLayout={() => ref.current?.measureInWindow((_x, y, _w, h) => setMiniLayout(y, h))}>
      <MiniPlayerView />
    </View>
  );
}

const styles = StyleSheet.create({
  // Square and full width, so the progress line is visible from its very start to its end.
  card: { overflow: 'hidden' },
  placeholder: { opacity: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8 },
  art: { borderRadius: 8 },
  spacer: { flex: 1, minWidth: 0 },
  playBox: { width: 48, height: 48 },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  track: { height: 3 },
  trackBg: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.3 },
  fill: { height: 3 },
});
