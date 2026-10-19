import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Artwork } from '@/components/ui/artwork';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import { formatClock } from '@/lib/player-math';
import { playEpisodeAt } from '@/player';
import { useBookmarks } from '@/store/bookmarks';
import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';

/** Saved positions. With `podcastId` only that show's bookmarks are listed. */
export function BookmarkList({ podcastId, emptyText }: { podcastId?: string; emptyText: string }) {
  const theme = useTheme();
  const items = useBookmarks((s) => s.items);
  const feeds = useFeeds((s) => s.feeds);
  const full = useFeeds((s) => s.full);
  const known = useFeeds((s) => s.known);
  const subs = useLibrary((s) => s.subscriptions);

  const rows = useMemo(
    () =>
      items
        .filter((b) => !podcastId || b.podcastId === podcastId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .flatMap((b) => {
          const podcast = subs[b.podcastId]?.podcast ?? known[b.podcastId];
          const episode = (full[b.podcastId]?.episodes ?? feeds[b.podcastId]?.episodes)?.find((e) => e.id === b.episodeId);
          return podcast && episode ? [{ b, podcast, episode }] : [];
        }),
    [items, podcastId, subs, known, full, feeds],
  );

  if (!rows.length) {
    return (
      <ThemedText themeColor="textSecondary" style={styles.empty}>
        {emptyText}
      </ThemedText>
    );
  }

  return (
    <View>
      {rows.map(({ b, podcast, episode }) => (
        <View key={b.id} style={[styles.row, { borderBottomColor: theme.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Play ${episode.title} from ${formatClock(b.timeSec)}`}
            onPress={() => playEpisodeAt(episode, podcast, b.timeSec)}
            style={styles.main}>
            <Artwork uri={episode.artwork ?? podcast.artwork} title={podcast.title} size={52} radius={8} />
            <View style={styles.text}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {podcast.title}
              </ThemedText>
              <ThemedText type="smallBold" numberOfLines={2}>
                {episode.title}
              </ThemedText>
              <View style={styles.time}>
                <Icon name="bookmark" size={16} color={theme.accent} />
                <ThemedText type="smallBold" themeColor="accent">
                  {formatClock(b.timeSec)}
                </ThemedText>
              </View>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Delete bookmark" hitSlop={8} onPress={() => useBookmarks.getState().remove(b.id)}>
            <Icon name="delete-outline" size={22} color={theme.textSecondary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open episode"
            hitSlop={8}
            onPress={() => router.push({ pathname: '/episode', params: { podcastId: podcast.id, episodeId: episode.id } })}>
            <Icon name="chevron-right" size={24} color={theme.textSecondary} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', padding: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, gap: 2 },
  time: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
