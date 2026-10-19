import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedError } from '@/api/feed-fetch';
import { GENRES, lookupPodcast, searchEpisodes, searchPodcasts, topPodcasts } from '@/api/itunes';
import type { Episode, Podcast } from '@/api/types';
import { FeaturedCarousel } from '@/components/discovery/featured-carousel';
import { EpisodeResultRow, PodcastResultRow } from '@/components/discovery/result-rows';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Artwork } from '@/components/ui/artwork';
import { Icon } from '@/components/ui/icon';
import { useAsync, useDebounced } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { openDiscoveredPodcast } from '@/lib/open-podcast';
import { addFeedFromUrl } from '@/lib/add-feed';
import { hostLabel, toFeedUrl } from '@/lib/podcast-id';
import { useFeeds } from '@/store/feeds';

type Tab = 'podcasts' | 'episodes';

type AddState =
  | { url: string; status: 'adding' }
  | { url: string; status: 'added' | 'existing'; podcast: Podcast }
  | { url: string; status: 'error'; message: string };

export default function DiscoveryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('podcasts');
  const [genre, setGenre] = useState<number | undefined>(undefined);
  const [showAll, setShowAll] = useState(false);

  const term = useDebounced(query.trim(), 350);
  // A feed address is added, never searched for. Use the live text (not the debounced term) so a
  // pasted URL doesn't trigger a search while the debounce catches up.
  const feedUrl = toFeedUrl(query);
  const feedMode = feedUrl !== null;
  const searching = !feedMode && term.length > 0 && toFeedUrl(term) === null;
  const [addState, setAddState] = useState<AddState | null>(null);
  const add = addState && addState.url === feedUrl ? addState : null;

  const submitFeed = async () => {
    if (!feedUrl || add?.status === 'adding') return;
    setAddState({ url: feedUrl, status: 'adding' });
    try {
      const r = await addFeedFromUrl(feedUrl);
      setAddState({ url: feedUrl, status: r.status, podcast: r.podcast });
    } catch (e) {
      setAddState({ url: feedUrl, status: 'error', message: e instanceof FeedError ? e.message : "Couldn't add this podcast." });
    }
  };

  const featured = useAsync('featured', () => topPodcasts('us', 7));
  const trending = useAsync(`trending-${genre ?? 'all'}`, () => topPodcasts('us', 20, genre));
  const podcastResults = useAsync(`sp-${searching && !feedMode && tab === 'podcasts' ? term : ''}`, () =>
    searching && !feedMode && tab === 'podcasts' ? searchPodcasts(term) : Promise.resolve([] as Podcast[]),
  );
  const episodeResults = useAsync(`se-${searching && !feedMode && tab === 'episodes' ? term : ''}`, () =>
    searching && !feedMode && tab === 'episodes' ? searchEpisodes(term) : Promise.resolve([] as Episode[]),
  );

  const openEpisodeShow = async (e: Episode) => {
    const known = useFeeds.getState().known[e.podcastId];
    const p = known ?? (await lookupPodcast(e.podcastId).catch(() => null));
    if (p) openDiscoveredPodcast(p);
  };

  const trendingList = useMemo(() => (showAll ? trending.data : trending.data?.slice(0, 5)) ?? [], [showAll, trending.data]);

  const input = (
    <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
      <Icon name="search" size={22} color={theme.textSecondary} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search podcasts or add RSS URL"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType={feedMode ? 'go' : 'search'}
        onSubmitEditing={() => void submitFeed()}
        accessibilityLabel="Search podcasts or add RSS URL"
        style={[styles.input, { color: theme.text }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
      />
      {query ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}>
          <Icon name="close" size={20} color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );

  const status = (loading: boolean, error: Error | undefined, retry: () => void, emptyText: string, count: number) => {
    if (loading) return <ActivityIndicator color={theme.accent} style={styles.pad} />;
    if (error)
      return (
        <Pressable onPress={retry} accessibilityRole="button" style={styles.pad}>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            Couldn&apos;t load this. Tap to try again.
          </ThemedText>
        </Pressable>
      );
    if (!count) return <ThemedText themeColor="textSecondary" style={[styles.center, styles.pad]}>{emptyText}</ThemedText>;
    return null;
  };

  return (
    <ThemedView style={styles.fill}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8 }}>{input}</View>

      {searching && !feedMode ? (
        <>
          <View style={styles.tabs}>
            {(['podcasts', 'episodes'] as const).map((t) => (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t }}
                onPress={() => setTab(t)}
                style={[styles.pill, { backgroundColor: tab === t ? theme.text : 'transparent' }]}>
                <ThemedText type="smallBold" style={{ color: tab === t ? theme.background : theme.textSecondary }}>
                  {t === 'podcasts' ? 'Podcasts' : 'Episodes'}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          {tab === 'podcasts' ? (
            <FlatList
              data={podcastResults.data ?? []}
              keyExtractor={(p) => p.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={status(podcastResults.loading, podcastResults.error, podcastResults.reload, `No podcasts found for “${term}”`, podcastResults.data?.length ?? 0)}
              renderItem={({ item }) => <PodcastResultRow podcast={item} onPress={() => openDiscoveredPodcast(item)} />}
            />
          ) : (
            <FlatList
              data={episodeResults.data ?? []}
              keyExtractor={(e) => e.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={status(episodeResults.loading, episodeResults.error, episodeResults.reload, `No episodes found for “${term}”`, episodeResults.data?.length ?? 0)}
              renderItem={({ item }) => <EpisodeResultRow episode={item} onPress={() => void openEpisodeShow(item)} />}
            />
          )}
        </>
      ) : feedMode ? (
        <View style={styles.pad}>
          {add?.status === 'adding' ? (
            <View style={styles.addRow}>
              <ActivityIndicator color={theme.accent} />
              <ThemedText themeColor="textSecondary">Adding podcast…</ThemedText>
            </View>
          ) : add?.status === 'added' || add?.status === 'existing' ? (
            <View style={styles.rssCard}>
              <Artwork uri={add.podcast.artwork} title={add.podcast.title} size={96} radius={12} />
              <View style={{ flex: 1, gap: 4 }}>
                <ThemedText type="smallBold" themeColor="success">
                  {add.status === 'added' ? 'Added to your library' : 'Already in your library'}
                </ThemedText>
                <ThemedText type="smallBold" numberOfLines={2}>{add.podcast.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{add.podcast.author}</ThemedText>
                <View style={styles.rssActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openDiscoveredPodcast(add.podcast)}
                    style={[styles.open, { borderColor: theme.border }]}>
                    <ThemedText type="smallBold">Open</ThemedText>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setQuery('')} hitSlop={8}>
                    <ThemedText type="smallBold" themeColor="textSecondary">Add another</ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.addCol}>
              <Icon name="rss-feed" size={40} color={theme.accent} />
              <ThemedText type="subtitle" style={styles.center}>Add this podcast feed</ThemedText>
              {/* Only the domain is shown: private links carry secret tokens in the path or query. */}
              <ThemedText themeColor="textSecondary" style={styles.center}>
                {hostLabel(feedUrl)}
              </ThemedText>
              {add?.status === 'error' ? (
                <ThemedText themeColor="accent" style={styles.center} accessibilityLiveRegion="polite">
                  {add.message}
                </ThemedText>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={add?.status === 'error' ? 'Try again' : 'Add podcast'}
                onPress={() => void submitFeed()}
                style={[styles.addButton, { backgroundColor: theme.accent }]}>
                <ThemedText type="smallBold" style={{ color: '#fff' }}>
                  {add?.status === 'error' ? 'Try again' : 'Add podcast'}
                </ThemedText>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {[{ id: undefined, name: 'All categories' }, ...GENRES].map((g) => (
              <Pressable
                key={g.name}
                accessibilityRole="button"
                accessibilityState={{ selected: genre === g.id }}
                onPress={() => {
                  setGenre(g.id);
                  setShowAll(false);
                }}
                style={[
                  styles.chip,
                  { borderColor: genre === g.id ? theme.accent : theme.border, backgroundColor: genre === g.id ? theme.accentSoft : 'transparent' },
                ]}>
                <ThemedText type="smallBold" style={{ color: genre === g.id ? theme.accent : theme.text }}>
                  {g.name}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>

          {featured.data ? <FeaturedCarousel items={featured.data} onOpen={openDiscoveredPodcast} /> : null}
          {featured.loading ? <ActivityIndicator color={theme.accent} style={styles.pad} /> : null}

          <View style={styles.sectionHead}>
            <ThemedText type="subtitle" accessibilityRole="header">Trending</ThemedText>
            {trending.data && trending.data.length > 5 ? (
              <Pressable accessibilityRole="button" onPress={() => setShowAll((v) => !v)}>
                <ThemedText type="smallBold" style={{ color: theme.badge }}>{showAll ? 'SHOW LESS' : 'SHOW ALL'}</ThemedText>
              </Pressable>
            ) : null}
          </View>
          {trendingList.map((p) => (
            <PodcastResultRow key={p.id} podcast={p} onPress={() => openDiscoveredPodcast(p)} />
          ))}
          {status(trending.loading, trending.error, trending.reload, 'Nothing trending here right now.', trendingList.length)}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 14, height: 48 },
  input: { flex: 1, fontSize: 16, height: 48 },
  chips: { paddingHorizontal: 16, paddingVertical: 8, gap: 10 },
  chip: { borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  pill: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  pad: { padding: 24 },
  center: { textAlign: 'center' },
  rssCard: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  addRow: { flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' },
  addCol: { alignItems: 'center', gap: 12 },
  addButton: { borderRadius: 24, paddingHorizontal: 28, paddingVertical: 12, minWidth: 180, alignItems: 'center', marginTop: 4 },
  rssActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  open: { borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 8 },
});
