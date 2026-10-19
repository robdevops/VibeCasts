import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { EmptyLibrary } from '@/components/podcasts/empty-library';
import { LibraryGrid } from '@/components/podcasts/library-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconButton } from '@/components/ui/icon-button';
import { MenuSheet, type MenuItem } from '@/components/ui/menu-sheet';
import { NamePrompt } from '@/components/ui/name-prompt';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useLibraryView } from '@/hooks/use-library-view';
import { useTheme } from '@/hooks/use-theme';
import { parseKey } from '@/lib/layout';
import { SORT_LABELS, sortTiles, type PodcastSort, type SortableTile } from '@/lib/podcast-sort';
import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';

export default function PodcastsScreen() {
  const theme = useTheme();
  const view = useLibraryView();
  const homeOrder = useLibrary((s) => s.homeOrder);
  const sort = useLibrary((s) => s.sort);
  const layout = useLibrary((s) => s.layout);
  const libraryReady = useLibrary((s) => s.hydrated);
  const feedsReady = useFeeds((s) => s.hydrated);

  const progress = useFeeds((s) => s.backfillProgress);
  const [query, setQuery] = useState<string | null>(null);
  const [menu, setMenu] = useState<'main' | 'sort' | null>(null);
  const [newFolder, setNewFolder] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const podcasts = useMemo(() => Object.values(view.subscriptions).map((s) => s.podcast), [view.subscriptions]);
  const podcastIds = podcasts.map((p) => p.id).join(',');

  // Fetch feeds that are missing or stale once storage has loaded, and when new shows are added.
  useEffect(() => {
    if (!libraryReady || !feedsReady) return;
    // Shows imported from a file get their artwork and details first, then the rest refresh.
    void useFeeds
      .getState()
      .backfill(podcasts)
      .then(() => useFeeds.getState().refreshAll(podcasts.filter((p) => !p.needsMeta), { onlyStale: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryReady, feedsReady, podcastIds]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await useFeeds.getState().refreshAll(podcasts);
    setRefreshing(false);
  }, [podcasts]);

  const searching = query !== null && query.trim().length > 0;

  const keys = useMemo(() => {
    if (searching) {
      const q = (query ?? '').trim().toLowerCase();
      return Object.values(view.subscriptions)
        .filter((s) => s.podcast.title.toLowerCase().includes(q) || s.podcast.author.toLowerCase().includes(q))
        .sort((a, b) => a.podcast.title.localeCompare(b.podcast.title))
        .map((s) => `p:${s.podcast.id}`);
    }
    const tiles: SortableTile[] = homeOrder.map((key) => {
      const { type, id } = parseKey(key);
      if (type === 'folder') {
        const f = view.folders[id];
        return { key, name: f?.name ?? '', added: f?.createdAt ?? 0, latest: view.folderLatest(id) };
      }
      const s = view.subscriptions[id];
      return { key, name: s?.podcast.title ?? '', added: s?.subscribedAt ?? 0, latest: view.latest[id] ?? 0 };
    });
    return sortTiles(tiles, sort);
  }, [searching, query, homeOrder, sort, view]);

  const setSort = (s: PodcastSort) => {
    useLibrary.getState().setSort(s);
    setMenu(null);
  };

  const mainItems: MenuItem[] = [
    { label: `Sort by: ${SORT_LABELS[sort]}`, icon: 'sort', onPress: () => setMenu('sort') },
    {
      label: layout === 'tiles' ? 'Show as list' : 'Show as tiles',
      icon: layout === 'tiles' ? 'view-list' : 'grid-view',
      onPress: () => {
        useLibrary.getState().setLayout(layout === 'tiles' ? 'list' : 'tiles');
        setMenu(null);
      },
    },
    {
      label: 'Refresh all',
      icon: 'refresh',
      onPress: () => {
        setMenu(null);
        void refresh();
      },
    },
  ];

  const sortItems: MenuItem[] = (Object.keys(SORT_LABELS) as PodcastSort[]).map((s) => ({
    label: SORT_LABELS[s],
    checked: s === sort,
    onPress: () => setSort(s),
  }));

  const headerRight =
    query === null ? (
      <>
        <IconButton name="create-new-folder" label="New folder" color={theme.accent} onPress={() => setNewFolder(true)} />
        <IconButton name="search" label="Search podcasts" color={theme.accent} onPress={() => setQuery('')} />
        <IconButton name="more-vert" label="More options" color={theme.accent} onPress={() => setMenu('main')} />
      </>
    ) : null;

  return (
    <ThemedView style={styles.fill}>
      {query === null ? (
        <ScreenHeader title="Podcasts" large right={headerRight} />
      ) : (
        <ScreenHeader
          title=""
          back
          onBack={() => setQuery(null)}
          center={
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search your podcasts"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="search"
              accessibilityLabel="Search your podcasts"
              style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
          }
        />
      )}
      {progress ? (
        <View style={[styles.banner, { backgroundColor: theme.accentSoft }]} accessibilityLiveRegion="polite">
          <ThemedText type="small" style={{ color: theme.accent }}>
            Loading artwork {Math.min(progress.done + 1, progress.total)}/{progress.total}
          </ThemedText>
        </View>
      ) : null}
      <View style={styles.fill}>
        <LibraryGrid
          keys={keys}
          layout={layout}
          canReorder={sort === 'custom' && !searching}
          refreshing={refreshing}
          onRefresh={refresh}
          empty={
            searching ? (
              <EmptyLibrary message="No matching podcasts" showStarter={false} />
            ) : (
              <EmptyLibrary message="No podcasts yet" />
            )
          }
        />
      </View>
      <MenuSheet visible={menu === 'main'} items={mainItems} onClose={() => setMenu(null)} />
      <MenuSheet visible={menu === 'sort'} items={sortItems} title="Sort by" onClose={() => setMenu(null)} />
      <NamePrompt
        visible={newFolder}
        title="New folder"
        confirmLabel="Create"
        onCancel={() => setNewFolder(false)}
        onSubmit={(name, color) => {
          useLibrary.getState().createFolder(name, color);
          setNewFolder(false);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  banner: { marginHorizontal: 16, marginBottom: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10 },
  search: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
});
