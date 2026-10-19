import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Episode } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import { durationLabel, episodeDateLabel } from '@/lib/episode-list';
import { progressFraction, timeLeftLabel, type EpisodeState } from '@/lib/episode-state';
import { usePlayer } from '@/store/player';

import { PlayRing } from './play-ring';

type Props = {
  episode: Episode;
  state: EpisodeState | undefined;
  selecting: boolean;
  selected: boolean;
  onPress: (e: Episode) => void;
  onLongPress: (e: Episode) => void;
  onPlay: (e: Episode) => void;
};

function EpisodeRowBase({ episode, state, selecting, selected, onPress, onLongPress, onPlay }: Props) {
  const theme = useTheme();
  // True only while this exact episode is the one playing.
  const playingNow = usePlayer((s) => s.playing && s.current?.episode.id === episode.id && s.current.podcast.id === episode.podcastId);
  const inProgress = !!state && state.progressMs > 0 && !state.played;
  const sub = inProgress ? timeLeftLabel(state, episode.durationSec) : durationLabel(episode.durationSec);
  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: theme.border, backgroundColor: selected ? theme.accentSoft : 'transparent' },
        state?.archived ? { opacity: 0.55 } : null,
      ]}>
      {/* The play button is a sibling of the row's pressable: nesting buttons is invalid on web. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={episode.title}
        accessibilityState={{ selected }}
        onPress={() => onPress(episode)}
        onLongPress={() => onLongPress(episode)}
        delayLongPress={350}
        style={({ pressed }) => [styles.body, { opacity: pressed ? 0.6 : 1 }]}>
      {selecting ? (
        <View style={[styles.check, { borderColor: selected ? theme.accent : theme.border, backgroundColor: selected ? theme.accent : 'transparent' }]}>
          {selected ? <Icon name="check" size={16} color="#fff" /> : null}
        </View>
      ) : null}
      <View style={styles.text}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.date}>
          {episodeDateLabel(episode.published)}
          {state?.starred ? '  ★' : ''}
        </ThemedText>
        <ThemedText type="smallBold" numberOfLines={3} style={styles.title}>
          {episode.title}
        </ThemedText>
        {sub ? (
          <ThemedText type="small" themeColor="textSecondary">
            {sub}
          </ThemedText>
        ) : null}
      </View>
      </Pressable>
      <PlayRing
        label={`${playingNow ? 'Pause' : 'Play'} ${episode.title}`}
        playing={playingNow}
        progress={progressFraction(state, episode.durationSec)}
        played={!!state?.played}
        onPress={() => onPlay(episode)}
      />
    </View>
  );
}

export const EpisodeRow = memo(EpisodeRowBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 3 },
  date: { fontSize: 12, letterSpacing: 0.8 },
  title: { fontSize: 16, lineHeight: 22 },
});
