import { Pressable, StyleSheet, View } from 'react-native';

import type { Episode, Podcast } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Artwork } from '@/components/ui/artwork';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import { durationLabel, episodeDateLabel } from '@/lib/episode-list';
import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';

/** "+" to subscribe, or the green check once subscribed. */
export function SubscribeButton({ podcast }: { podcast: Podcast }) {
  const theme = useTheme();
  const subscribed = useLibrary((s) => !!s.subscriptions[podcast.id]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subscribed ? `Subscribed to ${podcast.title}` : `Subscribe to ${podcast.title}`}
      hitSlop={8}
      onPress={() => {
        if (subscribed) return;
        useFeeds.getState().remember(podcast);
        useLibrary.getState().subscribe(podcast);
      }}
      style={styles.sub}>
      <Icon name={subscribed ? 'check' : 'add'} size={28} color={subscribed ? theme.success : theme.textSecondary} />
    </Pressable>
  );
}

export function PodcastResultRow({ podcast, onPress }: { podcast: Podcast; onPress: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${podcast.title}, ${podcast.author}`}
        onPress={onPress}
        style={({ pressed }) => [styles.body, { backgroundColor: pressed ? theme.backgroundElement : 'transparent' }]}>
        <Artwork uri={podcast.artwork} title={podcast.title} size={64} radius={8} />
        <View style={styles.text}>
          <ThemedText type="smallBold" numberOfLines={2}>
            {podcast.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {podcast.author}
          </ThemedText>
        </View>
      </Pressable>
      <SubscribeButton podcast={podcast} />
    </View>
  );
}

export function EpisodeResultRow({ episode, onPress }: { episode: Episode; onPress: () => void }) {
  const theme = useTheme();
  const bits = [episodeDateLabel(episode.published), durationLabel(episode.durationSec)].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundElement : 'transparent' }]}>
      <Artwork uri={episode.artwork} title={episode.title} size={64} radius={8} />
      <View style={styles.text}>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {bits}
        </ThemedText>
        <ThemedText type="smallBold" numberOfLines={3}>
          {episode.title}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 8 },
  text: { flex: 1, gap: 2 },
  sub: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
