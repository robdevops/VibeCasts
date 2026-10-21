import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Artwork } from '@/components/ui/artwork';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import type { Episode, Podcast } from '@/api/types';
import { formatClock } from '@/lib/player-math';
import { fromRef, toRef, type EpisodeRef } from '@/lib/playlist';
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

  // An episode comes from the feed when it is held, else from the copy saved with the bookmark.
  const rows = useMemo(
    () =>
      items
        .filter((b) => !podcastId || b.podcastId === podcastId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .flatMap((b) => {
          const saved = b.ref ? fromRef(b.ref) : undefined;
          const podcast = subs[b.podcastId]?.podcast ?? known[b.podcastId] ?? saved?.podcast;
          const live = (full[b.podcastId]?.episodes ?? feeds[b.podcastId]?.episodes)?.find((e) => e.id === b.episodeId);
          const episode: Episode | undefined = live ?? saved?.episode;
          return podcast && episode ? [{ b, podcast: podcast as Podcast, episode }] : [];
        }),
    [items, podcastId, subs, known, full, feeds],
  );

  // Bookmarks made before the episode was saved with them: save it now when the feed has it, otherwise load that show's
  // feed once (a few shows at a time) so the row doesn't disappear when the feed isn't held in memory.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    const refs: Record<string, EpisodeRef> = {};
    const toLoad: Podcast[] = [];
    for (const b of items) {
      if (b.ref) continue;
      const podcast = subs[b.podcastId]?.podcast ?? known[b.podcastId];
      const live = (full[b.podcastId]?.episodes ?? feeds[b.podcastId]?.episodes)?.find((e) => e.id === b.episodeId);
      if (podcast && live) refs[b.id] = toRef(live, podcast);
      else if (podcast && !asked.current.has(podcast.id) && toLoad.length < 4) toLoad.push(podcast);
    }
    if (Object.keys(refs).length) useBookmarks.getState().attachRefs(refs);
    for (const p of toLoad) {
      asked.current.add(p.id);
      void useFeeds.getState().refresh(p);
    }
  }, [items, subs, known, full, feeds]);

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
