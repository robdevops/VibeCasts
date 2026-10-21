import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, TextInput, View } from 'react-native';

import { planCategories } from '@/lib/auto-categorize';
import { confirmAsync } from '@/components/ui/confirm';
import { EmptyLibrary } from '@/components/podcasts/empty-library';
import { LibraryGrid } from '@/components/podcasts/library-grid';
import { TileSkeleton } from '@/components/podcasts/tile-skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconButton } from '@/components/ui/icon-button';
import { MenuSheet, type MenuItem } from '@/components/ui/menu-sheet';
import { NamePrompt } from '@/components/ui/name-prompt';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useAppActive } from '@/hooks/use-app-active';
import { useLibraryView } from '@/hooks/use-library-view';
import { useStableList } from '@/hooks/use-stable-list';
import { useTheme } from '@/hooks/use-theme';
import { displayOrder } from '@/lib/display-order';
import { parseKey } from '@/lib/layout';
import { ensureThumbs } from '@/artwork/thumbs';
import { prefetchTileArtwork } from '@/lib/prefetch-artwork';
import { searchPodcasts } from '@/lib/search';
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
    // Shows imported from a file get their artwork and details first, then the rest refresh. Both go
    // nearest the viewport first, and only while the phone is unlocked and this tab is showing.
    void useFeeds
      .getState()
      .backfill(podcasts, { whileLooking: true })
      .then(() => useFeeds.getState().refreshAll(podcasts.filter((p) => !p.needsMeta), { onlyStale: true, whileLooking: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryReady, feedsReady, podcastIds]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    // The spinner goes as soon as any feed has come back; the rest keep loading (their badges update as they land).
    const stop = useFeeds.subscribe((s, prev) => {
      if (s.feeds === prev.feeds) return;
      stop();
      setRefreshing(false);
    });
    await useFeeds.getState().refreshAll(podcasts);
    stop();
    setRefreshing(false);
  }, [podcasts]);

  const searching = query !== null && query.trim().length > 0;
  // A search result being dragged: the grid shows the whole library so it can be placed anywhere.
  const [dragFromSearch, setDragFromSearch] = useState<string | null>(null);

  const sortedKeys = useMemo(() => {
    // Skip keys that no longer point at a show or folder (they would leave an empty slot).
    const known = homeOrder.filter((key) => {
      const { type, id } = parseKey(key);
      return type === 'folder' ? !!view.folders[id] : !!view.subscriptions[id];
    });
    const tiles: SortableTile[] = known.map((key) => {
      const { type, id } = parseKey(key);
      if (type === 'folder') {
        const f = view.folders[id];
        return { key, name: f?.name ?? '', added: f?.createdAt ?? 0, latest: view.folderLatest(id) };
      }
      const s = view.subscriptions[id];
      return { key, name: s?.podcast.title ?? '', added: s?.subscribedAt ?? 0, latest: view.latest[id] ?? 0 };
    });
    return sortTiles(tiles, sort);
  }, [homeOrder, sort, view]);
  // Most feed arrivals change nothing about the order: keep the same array so the grid is left alone.
  const mainKeys = useStableList(sortedKeys) as string[];

  const searchKeys = useMemo(
    () =>
      // Matches at the start of a word in the title or author ("me" finds Metaverse, not Games).
      searchPodcasts(
        Object.values(view.subscriptions).map((s) => s.podcast),
        query ?? '',
      ).map((id) => `p:${id}`),
    [view.subscriptions, query],
  );

  const keys = useMemo(() => {
    if (dragFromSearch) {
      // A podcast that lives inside a folder has no tile of its own: show it as an extra one while it is dragged.
      return mainKeys.includes(dragFromSearch) ? mainKeys : [...mainKeys, dragFromSearch];
    }
    return searching ? searchKeys : mainKeys;
  }, [dragFromSearch, searching, searchKeys, mainKeys]);

  const onDragBegin = (key: string) => {
    if (!searching) return;
    Keyboard.dismiss();
    setDragFromSearch(key);
  };
  const onDragFinish = () => {
    if (dragFromSearch === null) return;
    // Done placing it: close the search so the library shows where it landed.
    setDragFromSearch(null);
    setQuery(null);
  };

  // Load what is on screen first, and only while the phone is unlocked with this tab showing.
  const focused = useIsFocused();
  const appActive = useAppActive();
  const looking = focused && appActive;
  useEffect(() => {
    useFeeds.getState().setLooking(looking);
    return () => useFeeds.getState().setLooking(false);
  }, [looking]);

  // The load priority follows what is on screen. The visible range lives in a ref and is pushed to
  // the feeds store on a trailing throttle: putting it in React state would re-render this whole
  // screen (and every tile) each time scrolling crosses a row.
  const visibleStart = useRef(0);
  const prioritySource = useRef({ mainKeys, folderOrder: view.folderOrder, ignoreScroll: false });
  useEffect(() => {
    prioritySource.current = { mainKeys, folderOrder: view.folderOrder, ignoreScroll: searching && !dragFromSearch };
  });
  const pushPriority = useCallback(() => {
    const { mainKeys: keys, folderOrder, ignoreScroll } = prioritySource.current;
    useFeeds.getState().setPriority(displayOrder(keys, folderOrder, { from: ignoreScroll ? 0 : visibleStart.current }));
  }, []);
  const priorityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onVisibleChange = useCallback(
    (r: { start: number }) => {
      visibleStart.current = r.start;
      if (priorityTimer.current) return;
      priorityTimer.current = setTimeout(() => {
        priorityTimer.current = undefined;
        pushPriority();
      }, 300);
    },
    [pushPriority],
  );
  useEffect(() => () => clearTimeout(priorityTimer.current), []);
  const priority = useMemo(
    () => displayOrder(mainKeys, view.folderOrder, { from: 0 }),
    [mainKeys, view.folderOrder],
  );
  useEffect(() => {
    pushPriority();
  }, [mainKeys, view.folderOrder, searching, dragFromSearch, pushPriority]);

  // Warm the artwork of the tiles in the order they are shown (the first screenful first).
  const priorityRef = useRef(priority);
  useEffect(() => {
    priorityRef.current = priority;
  });
  useEffect(() => {
    if (!libraryReady || !looking) return;
    const subs = useLibrary.getState().subscriptions;
    const urls = priorityRef.current.map((id) => subs[id]?.podcast.artwork ?? '');
    // Warm the cache in display order, then make tile-sized copies of the images whose host can't resize them.
    const shouldContinue = () => useFeeds.getState().looking;
    void prefetchTileArtwork(urls, { shouldContinue }).then(() => ensureThumbs(urls, { shouldContinue }));
  }, [libraryReady, looking, podcastIds]);

  const setSort = (s: PodcastSort) => {
    useLibrary.getState().setSort(s);
    setMenu(null);
  };

  // File the loose shows into folders named after their category. Shows with no category known yet are fetched first.
  const autoCategorize = async () => {
    setMenu(null);
    const loose = () => {
      const { subscriptions } = useLibrary.getState();
      return Object.values(subscriptions).filter((s) => !s.folderId).map((s) => s.podcast);
    };
    await useFeeds.getState().backfill(loose(), { need: (p) => !p.category, label: 'Finding categories' });
    const { subscriptions, folders } = useLibrary.getState();
    const plan = planCategories(
      Object.values(subscriptions).filter((s) => !s.folderId).map((s) => s.podcast),
      Object.values(folders),
    );
    if (!plan.groups.length) {
      await confirmAsync('Nothing to sort', 'No loose podcasts share a category yet.', 'OK');
      return;
    }
    const made = plan.groups.filter((g) => !g.folderId).length;
    const ok = await confirmAsync(
      'Sort into folders?',
      `${plan.moved} podcasts go into ${plan.groups.length} folders (${made} new). ${plan.uncategorised} stay on the grid.`,
      'Sort',
    );
    if (ok) useLibrary.getState().applyCategories(plan.groups);
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

  const sortItems: MenuItem[] = (Object.keys(SORT_LABELS) as PodcastSort[]).map((s): MenuItem => ({
    label: SORT_LABELS[s],
    checked: s === sort,
    onPress: () => setSort(s),
  })).concat({
    label: 'Auto categorize',
    icon: 'create-new-folder',
    separator: true,
    disabled: searching,
    onPress: () => void autoCategorize(),
  } as MenuItem);

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
            {progress.label ?? 'Loading artwork'} {Math.min(progress.done + 1, progress.total)}/{progress.total}
          </ThemedText>
        </View>
      ) : null}
      <View style={styles.fill}>
        <LibraryGrid
          keys={keys}
          layout={layout}
          canReorder={!searching || dragFromSearch !== null}
          onDragBegin={onDragBegin}
          onDragFinish={onDragFinish}
          onVisibleChange={onVisibleChange}
          refreshing={refreshing}
          onRefresh={refresh}
          empty={
            !libraryReady ? (
              <TileSkeleton />
            ) : searching ? (
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
