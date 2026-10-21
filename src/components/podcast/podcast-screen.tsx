import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ELASTIC_SCROLL } from '@/constants/scroll';
import { lookupPodcast } from '@/api/itunes';
import { releaseSchedule } from '@/api/rss';
import type { Episode } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Artwork } from '@/components/ui/artwork';
import { confirmAsync } from '@/components/ui/confirm';
import { Icon, type IconName } from '@/components/ui/icon';
import { MenuSheet, type MenuItem } from '@/components/ui/menu-sheet';
import { NamePrompt } from '@/components/ui/name-prompt';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { episodeCounts, visibleEpisodes, type EpisodeSort } from '@/lib/episode-list';
import { episodeKey } from '@/lib/episode-state';
import { capabilitiesFor } from '@/lib/podcast-capabilities';
import { hostLabel } from '@/lib/podcast-id';
import { toggleEpisode } from '@/player';
import { AddToPlaylistSheet } from '@/components/playlists/add-to-playlist-sheet';
import { toRef, type EpisodeRef } from '@/lib/playlist';
import { usePlaylists } from '@/store/playlists';
import { requestNotificationPermission } from '@/notifications/platform';
import { downloadsSupported, useDownloads } from '@/downloads/download-manager';
import { useFeeds } from '@/store/feeds';
import { useFlight } from '@/store/flight';
import { useLibrary } from '@/store/library';
import { useToast } from '@/store/toast';

import { BookmarkList } from './bookmark-list';
import { EpisodeRow } from './episode-row';

type Menu = 'overflow' | 'gear' | 'folder' | 'skipFirst' | 'skipLast' | 'selection' | null;

/** Choices for "skip first / last" (seconds). */
const SKIP_CHOICES = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
const skipLabel = (sec: number) => (sec ? `${sec} s` : 'Off');

export default function PodcastScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const sub = useLibrary((s) => s.subscriptions[id]);
  const states = useLibrary((s) => s.episodes);
  const folders = useLibrary((s) => s.folders);
  const known = useFeeds((s) => s.known[id]);
  const full = useFeeds((s) => s.full[id]);
  const cached = useFeeds((s) => s.feeds[id]);
  const loadingFeed = useFeeds((s) => !!s.loading[id]);
  useEffect(() => useFeeds.getState().pinFull(id), [id]); // its whole feed is not evicted while this page is mounted

  const lookup = useAsync(`lookup-${id}`, () =>
    sub || known || !/^\d+$/.test(id) ? Promise.resolve(null) : lookupPodcast(id),
  );
  const podcast = sub?.podcast ?? known ?? lookup.data ?? undefined;
  const subscribed = !!sub;
  const caps = capabilitiesFor(subscribed);

  const feedUrl = podcast?.feedUrl;
  const hasFull = !!full;
  useEffect(() => {
    if (podcast && feedUrl && !hasFull) void useFeeds.getState().refresh(podcast);
    // Re-fetch only when the show changes or the in-memory copy goes away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedUrl, hasFull]);

  const episodes = useMemo(() => full?.episodes ?? cached?.episodes ?? [], [full, cached]);

  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<EpisodeSort>('newest');
  const [tab, setTab] = useState<'episodes' | 'bookmarks'>('episodes');
  // Switching to the (short) bookmarks list must not make the page jump back to the top: hold the
  // scroll range open (current offset + one screen) while it is showing.
  const scrollY = useRef(0);

  // The artwork flies between the grid tile and this artwork (see `store/flight.ts`): hidden here while it is in the air.
  const navigation = useNavigation();
  const { height: windowHeight } = useWindowDimensions();
  const flightKey = `podcast:${id}`;
  const hideArt = useFlight((s) => s.key === flightKey && (s.phase === 'opening' || s.phase === 'closing'));
  const artRef = useRef<View>(null);
  const artAt = useRef<{ x: number; y: number; size: number } | null>(null); // where the artwork was when the page was laid out
  const reportArt = () =>
    artRef.current?.measureInWindow((x, y, w) => {
      artAt.current = { x, y, size: w };
      useFlight.getState().setTarget(flightKey, { x, y, size: w });
    });
  useEffect(() => {
    const nav = navigation as unknown as { addListener(e: string, cb: () => void): () => void };
    // Closing: fly the artwork back to its tile, unless this page was scrolled so the artwork is out of view. Worked out
    // from the last known position and the scroll offset, right now: the view may already be gone by the time an
    // asynchronous measurement would answer.
    return nav.addListener('beforeRemove', () => {
      const at = artAt.current;
      const y = at ? at.y - scrollY.current : 0;
      useFlight.getState().close(flightKey, at && y + at.size > 0 && y < windowHeight ? { x: at.x, y, size: at.size } : null);
    });
  }, [navigation, flightKey, windowHeight]);

  const viewportH = useRef(0);
  const [holdHeight, setHoldHeight] = useState(0);
  const switchTab = (next: 'episodes' | 'bookmarks') => {
    if (next === 'bookmarks') {
      // Open the scroll range first, then swap the list a frame later: if the content shrank first,
      // the scroll position would already have been clamped to the top.
      setHoldHeight(scrollY.current + viewportH.current);
      requestAnimationFrame(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setTab('bookmarks');
      });
    } else {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTab('episodes');
      setHoldHeight(0);
    }
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aboutOpen, setAboutOpen] = useState(false);
  const [menu, setMenu] = useState<Menu>(null);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [newFolder, setNewFolder] = useState(false);

  const selecting = selected.size > 0;
  const shown = useMemo(
    () => visibleEpisodes(id, episodes, states, { query, showArchived, sort }),
    [id, episodes, states, query, showArchived, sort],
  );
  const counts = useMemo(() => episodeCounts(id, episodes, states), [id, episodes, states]);
  const schedule = useMemo(() => (episodes.length ? releaseSchedule(episodes.map((e) => e.published)) : ''), [episodes]);

  const lib = useLibrary.getState();
  const stateOf = (e: Episode) => states[episodeKey(id, e.id)];

  // The React Compiler memoises these, so no manual useCallback.
  const toggleSelected = (e: Episode) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(e.id)) next.delete(e.id);
      else next.add(e.id);
      return next;
    });
  };
  const onPress = (e: Episode) => {
    if (selected.size > 0) toggleSelected(e);
    else router.push({ pathname: '/episode', params: { podcastId: id, episodeId: e.id } });
  };
  const onLongPress = (e: Episode) => setSelected((prev) => (prev.size ? prev : new Set([e.id])));
  const onPlay = (e: Episode) => {
    if (selected.size > 0) toggleSelected(e);
    else if (podcast) toggleEpisode(e, podcast);
  };

  /** Apply `field` to all selected episodes: set it, or clear it if every one already has it. */
  const toggleField = (field: 'archived' | 'starred' | 'played') => {
    const ids = [...selected];
    const all = ids.every((eid) => !!states[episodeKey(id, eid)]?.[field]);
    lib.patchEpisodes(id, ids, field === 'played' ? { played: !all, progressMs: 0 } : { [field]: !all });
    setSelected(new Set());
  };

  const refresh = () => podcast && void useFeeds.getState().refresh(podcast);

  const share = async () => {
    if (!podcast) return;
    try {
      await Share.share({ message: `${podcast.title}${podcast.website ? ` — ${podcast.website}` : ''}` });
    } catch {
      useToast.getState().show("Sharing isn't available here");
    }
  };

  const subscribe = () => {
    if (!podcast) return;
    useFeeds.getState().remember(podcast);
    lib.subscribe(podcast);
  };

  const unsubscribe = async () => {
    if (!podcast) return;
    if (await confirmAsync('Unsubscribe?', `Remove ${podcast.title} from your library? Your progress will be kept.`, 'Unsubscribe')) {
      // Remember the show first so this page keeps showing it (as an unsubscribed preview).
      useFeeds.getState().remember(podcast);
      lib.unsubscribe(id);
    }
  };

  const markAllPlayed = async () => {
    if (await confirmAsync('Mark all as played?', `Mark all ${episodes.length} episodes as played?`, 'Mark played')) {
      lib.patchEpisodes(id, episodes.map((e) => e.id), { played: true, progressMs: 0 });
    }
  };

  const downloadNewest = () => {
    if (!podcast) return;
    const todo = episodes.filter((e) => !states[episodeKey(id, e.id)]?.played && !states[episodeKey(id, e.id)]?.archived).slice(0, 10);
    for (const e of todo) useDownloads.getState().download(e, podcast);
    useToast.getState().show(todo.length ? `Downloading ${todo.length} episode${todo.length === 1 ? '' : 's'}` : 'Nothing unplayed to download');
  };

  const selectedEpisodes = episodes.filter((e) => selected.has(e.id));
  const allSelectedDownloaded = selectedEpisodes.length > 0 && selectedEpisodes.every((e) => !!states[episodeKey(id, e.id)]?.downloadedUri);
  const downloadSelected = () => {
    if (!podcast) return;
    for (const e of selectedEpisodes) {
      if (allSelectedDownloaded) useDownloads.getState().remove(id, e.id);
      else useDownloads.getState().download(e, podcast);
    }
    setSelected(new Set());
  };

  const selectedRefs = (): EpisodeRef[] => (podcast ? selectedEpisodes.map((e) => toRef(e, podcast)) : []);
  const queueSelected = (where: 'first' | 'last') => {
    const refs = selectedRefs();
    if (where === 'first') usePlaylists.getState().playNext(refs);
    else usePlaylists.getState().playLast(refs);
    useToast.getState().show(`${refs.length} episode${refs.length === 1 ? '' : 's'} ${where === 'first' ? 'will play next' : 'added to Up Next'}`);
    setSelected(new Set());
  };

  const closing = (items: MenuItem[]) => items.map((i) => ({ ...i, onPress: () => { setMenu(null); i.onPress(); } }));

  const overrides = sub?.overrides ?? {};
  const overflowItems = closing([
    { label: sort === 'newest' ? 'Sort: oldest first' : 'Sort: newest first', icon: 'sort', onPress: () => setSort(sort === 'newest' ? 'oldest' : 'newest') },
    { label: 'Mark all as played', icon: 'done-all', onPress: () => void markAllPlayed() },
    { label: 'Download newest 10 unplayed', icon: 'file-download', disabled: !downloadsSupported || !podcast, onPress: downloadNewest },
  ]);

  // Turning notifications on shows at once and then checks permission (Android 13+ / iOS), turning it back off with a
  // hint if it is refused. Waiting for the permission check first left the toggle unchanged for seconds whenever the
  // phone was busy loading feeds.
  const setNotifications = (on: boolean) => {
    lib.setOverride(id, { notifications: on });
    if (!on) return;
    void requestNotificationPermission().then((ok) => {
      if (ok) return;
      lib.setOverride(id, { notifications: false });
      useToast.getState().show('Allow notifications for VibeCasts in system settings to get new-episode alerts');
    });
  };

  // The gear menu: subscription and everything that belongs to a subscription.
  const gearItems = closing([
    subscribed
      ? { label: 'Unsubscribe', icon: 'remove-circle-outline', destructive: true, onPress: () => void unsubscribe() }
      : { label: 'Subscribe', icon: 'add-circle-outline', onPress: subscribe },
    { label: 'Folder…', icon: 'folder-open', separator: true, disabled: !caps.folder, onPress: () => setMenu('folder') },
    {
      label: 'Notifications',
      icon: 'notifications-none',
      separator: true,
      checked: !!overrides.notifications,
      disabled: !caps.notifications,
      onPress: () => setNotifications(!overrides.notifications),
    },
    {
      label: 'Auto download',
      icon: 'file-download',
      checked: !!overrides.autoDownload,
      disabled: !caps.autoDownload,
      onPress: () => lib.setOverride(id, { autoDownload: !overrides.autoDownload }),
    },
    { label: `Skip first: ${skipLabel(overrides.skipFirstSec ?? 0)}…`, icon: 'skip-next', disabled: !caps.skipSettings, onPress: () => setMenu('skipFirst') },
    { label: `Skip last: ${skipLabel(overrides.skipLastSec ?? 0)}…`, icon: 'skip-previous', disabled: !caps.skipSettings, onPress: () => setMenu('skipLast') },
  ]);

  const skipItems = (field: 'skipFirstSec' | 'skipLastSec') =>
    closing(
      SKIP_CHOICES.map((sec) => ({
        label: skipLabel(sec),
        checked: (overrides[field] ?? 0) === sec,
        onPress: () => lib.setOverride(id, { [field]: sec }),
      })),
    );

  const folderItems = closing([
    { label: 'No folder', icon: 'folder-off', checked: !sub?.folderId, onPress: () => lib.removeFromFolder(id) },
    ...Object.values(folders).map((f) => ({
      label: f.name,
      icon: 'folder' as IconName,
      checked: sub?.folderId === f.id,
      onPress: () => lib.moveToFolder(id, f.id),
    })),
    { label: 'New folder…', icon: 'create-new-folder', separator: true, onPress: () => setNewFolder(true) },
  ]);

  const selectionItems = closing([
    { label: 'Select all', icon: 'select-all', onPress: () => setSelected(new Set(shown.map((e) => e.id))) },
    { label: allSelectedDownloaded ? 'Remove downloads' : 'Download', icon: 'file-download', disabled: !downloadsSupported, onPress: downloadSelected },
    { label: 'Play next', icon: 'queue-music', disabled: !podcast, onPress: () => queueSelected('first') },
    { label: 'Play last', icon: 'playlist-add-check', disabled: !podcast, onPress: () => queueSelected('last') },
    { label: 'Add to playlist…', icon: 'playlist-add', disabled: !podcast, onPress: () => setPlaylistOpen(true) },
  ]);

  if (!podcast) {
    return (
      <ThemedView style={[styles.fill, styles.center]}>
        {lookup.loading ? (
          <ActivityIndicator color={theme.accent} />
        ) : (
          <ThemedText themeColor="textSecondary">We couldn&apos;t find that podcast.</ThemedText>
        )}
      </ThemedView>
    );
  }

  const website = podcast.website ?? full?.meta.website;
  const category = podcast.category ?? full?.meta.category;
  const description = podcast.description ?? full?.meta.description;

  const header = (
    <View>
      <View style={[styles.hero, { paddingTop: insets.top + 64 }]}>
        {podcast.artwork ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Image source={{ uri: podcast.artwork }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={60} />
          </View>
        ) : null}
        <LinearGradient
          pointerEvents="none"
          colors={[`${theme.accent}00`, theme.background]}
          locations={[0, 0.92]}
          style={StyleSheet.absoluteFill}
        />
        <View ref={artRef} collapsable={false} onLayout={reportArt} style={{ opacity: hideArt ? 0 : 1 }}>
          <Artwork uri={podcast.artwork} title={podcast.title} size={128} radius={14} style={styles.heroArt} />
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: aboutOpen }} onPress={() => setAboutOpen((v) => !v)} style={styles.titleRow}>
          <ThemedText type="subtitle" style={styles.title} accessibilityRole="header">
            {podcast.title}
          </ThemedText>
          <Icon name={aboutOpen ? 'expand-less' : 'expand-more'} size={24} color={theme.text} />
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          {[category, podcast.author].filter(Boolean).join(' · ')}
        </ThemedText>
        {podcast.rating ? (
          <ThemedText type="smallBold" style={styles.centerText}>
            {'★'.repeat(Math.round(podcast.rating))}
            {'☆'.repeat(5 - Math.round(podcast.rating))} {podcast.rating.toFixed(1)}
            {podcast.ratingCount ? ` (${podcast.ratingCount > 999 ? `${(podcast.ratingCount / 1000).toFixed(1)}K` : podcast.ratingCount})` : ''}
          </ThemedText>
        ) : null}

        {!subscribed ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            Not subscribed. Tap the gear to subscribe.
          </ThemedText>
        ) : null}
      </View>

      {(
        <View style={styles.about}>
          {aboutOpen && description ? (
            <ThemedText type="small" themeColor="textSecondary">
              {description.replace(/<[^>]+>/g, '')}
            </ThemedText>
          ) : null}
          <View style={styles.metaRow}>
            {schedule ? (
              <View style={styles.meta}>
                <Icon name="event-repeat" size={18} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary">
                  {schedule}
                </ThemedText>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Podcast menu"
              onPress={() => setMenu('gear')}
              style={[styles.gear, { backgroundColor: theme.backgroundElement }]}>
              <Icon name="settings" size={22} color={theme.textSecondary} />
            </Pressable>
            {website ? (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(website)} style={styles.meta}>
                <Icon name="language" size={18} color={theme.badge} />
                <ThemedText type="small" style={{ color: theme.badge }} numberOfLines={1}>
                  {hostLabel(website)}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}

      <View style={styles.tabs}>
        {(['episodes', 'bookmarks'] as const).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            onPress={() => switchTab(t)}
            style={[styles.pill, { backgroundColor: tab === t ? theme.text : 'transparent' }]}>
            <ThemedText type="smallBold" style={{ color: tab === t ? theme.background : theme.textSecondary }}>
              {t === 'episodes' ? 'Episodes' : 'Bookmarks'}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {tab === 'episodes' ? (
        <>
          <View style={styles.searchRow}>
            <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
              <Icon name="search" size={22} color={theme.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search episodes"
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel="Search episodes"
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { color: theme.text }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
              />
              {query ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}>
                  <Icon name="close" size={20} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Podcast options" hitSlop={8} onPress={() => setMenu('overflow')} style={styles.overflow}>
              <Icon name="more-vert" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>
          <View style={[styles.summary, { borderColor: theme.border }]}>
            <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
              {`${counts.total} episodes`}
              {counts.archived ? ` · ${counts.archived} archived` : ''}
              {loadingFeed ? ' · updating…' : ''}
            </ThemedText>
            {counts.archived ? (
              <Pressable accessibilityRole="button" onPress={() => setShowArchived((v) => !v)}>
                <ThemedText type="smallBold" themeColor="accent" style={styles.toggle}>
                  {showArchived ? 'Hide archived' : 'Show archived'}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );

  return (
    <ThemedView style={styles.fill}>
      <FlatList
        {...ELASTIC_SCROLL}
        data={tab === 'episodes' ? shown : []}
        keyExtractor={(e) => e.id}
        extraData={`${selected.size}|${[...selected].join(',')}`}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={theme.accent} />}
        contentContainerStyle={{ paddingBottom: 32, minHeight: holdHeight || undefined }}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={32}
        onLayout={(e) => {
          viewportH.current = e.nativeEvent.layout.height;
        }}
        initialNumToRender={12}
        windowSize={9}
        renderItem={({ item }) => (
          <EpisodeRow
            episode={item}
            state={stateOf(item)}
            selecting={selecting}
            selected={selected.has(item.id)}
            onPress={onPress}
            onLongPress={onLongPress}
            onPlay={onPlay}
          />
        )}
        ListEmptyComponent={
          tab === 'bookmarks' ? (
            <BookmarkList podcastId={id} emptyText="Bookmarks you add while listening will show up here." />
          ) : loadingFeed && !episodes.length ? (
            <ActivityIndicator color={theme.accent} style={styles.empty} />
          ) : (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              {query ? `No episodes match “${query}”.` : episodes.length ? 'All episodes are archived.' : 'No episodes yet. Pull down to refresh.'}
            </ThemedText>
          )
        }
      />

      {/* Back and share stay on top of the scrolling hero. */}
      {!selecting ? (
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <TopChip name="arrow-back" label="Back" onPress={goBack} />
          <View style={{ flex: 1 }} />
          <TopChip name="share" label="Share" onPress={() => void share()} />
        </View>
      ) : (
        <View style={[styles.selectBar, { paddingTop: insets.top + 8, backgroundColor: theme.background, borderColor: theme.border }]}>
          <BarButton name="close" label="Cancel selection" onPress={() => setSelected(new Set())} />
          <ThemedText type="smallBold" style={{ flex: 1 }}>
            {selected.size} selected
          </ThemedText>
          <BarButton name="archive" label="Archive" onPress={() => toggleField('archived')} />
          <BarButton name="done-all" label="Mark played" onPress={() => toggleField('played')} />
          <BarButton name="star-border" label="Star" onPress={() => toggleField('starred')} />
          <BarButton name="more-vert" label="More actions" onPress={() => setMenu('selection')} />
        </View>
      )}

      <MenuSheet visible={menu === 'overflow'} items={overflowItems} onClose={() => setMenu(null)} />
      <MenuSheet visible={menu === 'gear'} items={gearItems} onClose={() => setMenu(null)} />
      <MenuSheet visible={menu === 'folder'} items={folderItems} title="Folder" onClose={() => setMenu(null)} />
      <MenuSheet visible={menu === 'skipFirst'} items={skipItems('skipFirstSec')} title="Skip first" onClose={() => setMenu(null)} />
      <MenuSheet visible={menu === 'skipLast'} items={skipItems('skipLastSec')} title="Skip last" onClose={() => setMenu(null)} />
      <MenuSheet visible={menu === 'selection'} items={selectionItems} onClose={() => setMenu(null)} />
      <AddToPlaylistSheet
        visible={playlistOpen}
        refs={selectedRefs()}
        onClose={() => {
          setPlaylistOpen(false);
          setSelected(new Set());
        }}
      />
      <NamePrompt
        visible={newFolder}
        title="New folder"
        confirmLabel="Create"
        onCancel={() => setNewFolder(false)}
        onSubmit={(name, color) => {
          const fid = lib.createFolder(name, color);
          lib.moveToFolder(id, fid);
          setNewFolder(false);
        }}
      />
    </ThemedView>
  );
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function TopChip({ name, label, onPress }: { name: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.chip}>
      <Icon name={name} size={24} color="#fff" />
    </Pressable>
  );
}

function BarButton({ name, label, onPress }: { name: IconName; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={styles.barButton}>
      <Icon name={name} size={24} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', paddingBottom: 8, paddingHorizontal: 16, gap: 8, overflow: 'hidden' },
  heroArt: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, maxWidth: '100%' },
  title: { fontSize: 24, lineHeight: 30, textAlign: 'center', flexShrink: 1 },
  centerText: { textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  round: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  subscribe: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 46, borderRadius: 23, paddingHorizontal: 20 },
  about: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  gear: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, justifyContent: 'center', alignItems: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 220 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  pill: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 9 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 14, height: 46 },
  input: { flex: 1, fontSize: 16, height: 46 },
  overflow: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  toggle: { letterSpacing: 0.5 },
  empty: { textAlign: 'center', padding: 32 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', paddingHorizontal: 12, zIndex: 10 },
  chip: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  selectBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 20 },
  barButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
});
