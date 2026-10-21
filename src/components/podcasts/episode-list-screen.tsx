import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ELASTIC_SCROLL } from '@/constants/scroll';
import type { Episode } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Artwork } from '@/components/ui/artwork';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/hooks/use-theme';
import type { EpisodeState } from '@/lib/episode-state';
import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';

type Row = { episode: Episode; state: EpisodeState };

/** Cross-podcast episode list (starred, history), resolved from the cached feeds. */
export function EpisodeListScreen({
  title,
  emptyText,
  include,
  sortBy,
}: {
  title: string;
  emptyText: string;
  include: (s: EpisodeState) => boolean;
  sortBy: (r: Row) => number;
}) {
  const theme = useTheme();
  const states = useLibrary((s) => s.episodes);
  const subs = useLibrary((s) => s.subscriptions);
  const feeds = useFeeds((s) => s.feeds);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const [key, state] of Object.entries(states)) {
      if (!include(state)) continue;
      const [podcastId, episodeId] = key.split('|');
      const episode = feeds[podcastId]?.episodes.find((e) => e.id === episodeId);
      if (episode) out.push({ episode, state });
    }
    return out.sort((a, b) => sortBy(b) - sortBy(a));
  }, [states, feeds, include, sortBy]);

  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader title={title} back />
      <FlatList
        {...ELASTIC_SCROLL}
        data={rows}
        keyExtractor={(r) => `${r.episode.podcastId}|${r.episode.id}`}
        contentContainerStyle={{ flexGrow: 1 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {emptyText}
            </ThemedText>
          </View>
        }
        renderItem={({ item: { episode } }) => {
          const podcast = subs[episode.podcastId]?.podcast;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/episode', params: { podcastId: episode.podcastId, episodeId: episode.id } })}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundElement : 'transparent' }]}>
              <Artwork uri={episode.artwork ?? podcast?.artwork} title={podcast?.title ?? episode.title} size={52} radius={8} />
              <View style={styles.text}>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {podcast?.title ?? ''}
                </ThemedText>
                <ThemedText type="smallBold" numberOfLines={2}>
                  {episode.title}
                </ThemedText>
              </View>
            </Pressable>
          );
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  text: { flex: 1, gap: 2 },
});
