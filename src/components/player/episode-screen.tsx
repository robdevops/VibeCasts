import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LayoutAnimation, Linking, Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Episode, Podcast } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Artwork } from '@/components/ui/artwork';
import { Icon, type IconName } from '@/components/ui/icon';
import { MenuSheet, type MenuItem } from '@/components/ui/menu-sheet';
import { AddToPlaylistSheet } from '@/components/playlists/add-to-playlist-sheet';
import { toRef } from '@/lib/playlist';
import { usePlaylists } from '@/store/playlists';
import { downloadsSupported, useDownloads } from '@/downloads/download-manager';
import { durationLabel, episodeDateLabel } from '@/lib/episode-list';
import { emptyEpisodeState, episodeKey } from '@/lib/episode-state';
import { formatClock, formatRate } from '@/lib/player-math';
import { stripHtml } from '@/lib/text';
import { bookmarksForEpisode, useBookmarks } from '@/store/bookmarks';
import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';
import { usePlayer } from '@/store/player';
import { useSettings } from '@/store/settings';
import { useToast } from '@/store/toast';

import { SkipIcon } from './skip-icon';
import { usePlayerSheetDrag } from './sheet-state';
import { SwipeIgnore, TabPager } from './tab-pager';
import { SleepSheet } from './sleep-sheet';
import { SpeedSheet } from './speed-sheet';

const BG = '#2A0C0C';
const MUTED = 'rgba(255,255,255,0.65)';
const ACCENT = '#FF5A52';

type Tab = 'playing' | 'details' | 'bookmarks';
type Sheet = 'speed' | 'sleep' | 'menu' | null;

/** The episode route: browse any episode (a modal over the app). */
export default function EpisodeScreen() {
  const params = useLocalSearchParams<{ podcastId?: string; episodeId?: string }>();
  return <EpisodeView podcastId={params.podcastId} episodeId={params.episodeId} onClose={close} />;
}

type ViewProps = {
  podcastId?: string;
  episodeId?: string;
  onClose: () => void;
  /** Rendered as the always-there player sheet (dragged by its header) rather than a route. */
  sheet?: boolean;
};

/** The player/episode screen: the current episode when no ids are given. */
export function EpisodeView({ podcastId, episodeId, onClose, sheet: isSheet = false }: ViewProps) {
  const params = { podcastId, episodeId };
  const insets = useSafeAreaInsets();
  const sheetDrag = usePlayerSheetDrag();
  const { width: pageWidth } = useWindowDimensions();
  const pagerX = useSharedValue(0);

  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const positionSec = usePlayer((s) => s.positionSec);
  const durationSec = usePlayer((s) => s.durationSec);
  const rate = usePlayer((s) => s.rate);
  const sleep = usePlayer((s) => s.sleep);
  const skipBack = useSettings((s) => s.skipBackSec);
  const skipForward = useSettings((s) => s.skipForwardSec);
  // The show whose feed to look in: the one named by the route, or (the player sheet) the one that is playing.
  const feedId = params.podcastId ?? current?.podcast.id;
  const full = useFeeds((s) => (feedId ? s.full[feedId] : undefined));
  const cached = useFeeds((s) => (feedId ? s.feeds[feedId] : undefined));
  const known = useFeeds((s) => (feedId ? s.known[feedId] : undefined));
  const subscribed = useLibrary((s) => (feedId ? s.subscriptions[feedId]?.podcast : undefined));
  const bookmarks = useBookmarks((s) => s.items);

  // Either the episode the user tapped (to look at it), or whatever is loaded in the player.
  const viewed = useMemo<{ podcast: Podcast; episode: Episode } | null>(() => {
    if (params.podcastId && params.episodeId) {
      const podcast = subscribed ?? known ?? (current?.podcast.id === params.podcastId ? current.podcast : undefined);
      const episode =
        (full?.episodes ?? cached?.episodes)?.find((e) => e.id === params.episodeId) ??
        (current?.episode.id === params.episodeId ? current.episode : undefined);
      return podcast && episode ? { podcast, episode } : null;
    }
    // The playing episode is stored without show notes (so a restored or library-started one has none): pick them up
    // from the feed once it has loaded.
    if (current && !current.episode.description) {
      const withNotes = full?.episodes.find((e) => e.id === current.episode.id);
      if (withNotes?.description) return { podcast: current.podcast, episode: { ...current.episode, description: withNotes.description } };
    }
    return current;
  }, [params.podcastId, params.episodeId, subscribed, known, full, cached, current]);

  const isCurrent = !!viewed && current?.episode.id === viewed.episode.id && current.podcast.id === viewed.podcast.id;
  const feedLoading = useFeeds((s) => (feedId ? !!s.loading[feedId] : false));
  // The saved feed cache leaves out show notes: fetch the feed when we are about to show an episode without them.
  const needsNotes = !!viewed && !viewed.episode.description && !full;
  // Opened from history/a notification for an episode older than the cache: load the whole feed to find it.
  const missingEpisode = !viewed && !!params.episodeId && !full;
  const feedPodcast = viewed?.podcast ?? subscribed ?? known;
  // Set when a load finished without the feed arriving (offline...), so the notes say so instead of "Loading" forever.
  const [notesFailedFor, setNotesFailedFor] = useState<string | null>(null);
  const notesKey = viewed ? `${viewed.podcast.id}|${viewed.episode.id}` : (params.episodeId ?? '');
  useEffect(() => {
    // Wait for a load already in progress (another view's); once it ends this runs again if the notes still aren't here.
    if (!(needsNotes || missingEpisode) || !feedPodcast || feedLoading || notesFailedFor === notesKey) return;
    void useFeeds
      .getState()
      .refresh(feedPodcast)
      .then(() => {
        if (!useFeeds.getState().full[feedPodcast.id]) setNotesFailedFor(notesKey);
      });
  }, [needsNotes, missingEpisode, feedPodcast, feedLoading, notesFailedFor, notesKey]);
  const notesFallback =
    notesFailedFor === notesKey ? 'Couldn’t load show notes.' : feedLoading || needsNotes ? 'Loading show notes…' : 'No show notes for this episode.';
  const [tab, setTab] = useState<Tab>('playing');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const tabList: Tab[] = ['playing', 'details', 'bookmarks'];

  // Tick once a second so the sleep-timer countdown stays fresh while the sheet is open.
  useEffect(() => {
    if (sheet !== 'sleep') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sheet]);

  const key = viewed ? episodeKey(viewed.podcast.id, viewed.episode.id) : '';
  const state = useLibrary((s) => s.episodes[key]) ?? emptyEpisodeState;
  const downloading = useDownloads((s) => !!s.active[key]);

  if (!viewed) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Header tab="details" tabs={['details']} onTab={() => {}} onClose={onClose} />
        <ThemedText style={styles.empty}>Nothing is playing yet.</ThemedText>
      </View>
    );
  }

  const { podcast, episode } = viewed;
  const duration = isCurrent && durationSec > 0 ? durationSec : episode.durationSec;
  // Not loaded yet: show where you left off (read-only) until you press play.
  const position = isCurrent ? (scrub ?? positionSec) : state.played ? 0 : state.progressMs / 1000;
  const epBookmarks = bookmarksForEpisode(bookmarks, podcast.id, episode.id);
  const lib = useLibrary.getState();

  const playPause = () => {
    if (isCurrent) usePlayer.getState().toggle();
    else {
      // The preview (small art + show notes) eases into the full player; the controls stay put.
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      usePlayer.getState().play(episode, podcast);
      setTab('playing');
    }
  };

  const addBookmark = () => {
    if (!isCurrent) {
      useToast.getState().show('Play the episode to add a bookmark');
      return;
    }
    const at = Math.round(usePlayer.getState().positionSec);
    const before = useBookmarks.getState().items.length;
    useBookmarks.getState().add(podcast.id, episode.id, at);
    const added = useBookmarks.getState().items.length > before;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    useToast.getState().show(added ? `Bookmarked at ${formatClock(at)}` : `Already bookmarked at ${formatClock(at)}`);
  };

  const openQueue = () => {
    onClose();
    router.push({ pathname: '/(tabs)/(playlists)/playlist/[id]', params: { id: 'up-next' } });
  };

  const queueIt = (where: 'first' | 'last') => {
    const refs = [toRef(episode, podcast)];
    if (where === 'first') usePlaylists.getState().playNext(refs);
    else usePlaylists.getState().playLast(refs);
    useToast.getState().show(where === 'first' ? 'Will play next' : 'Added to Up Next');
  };

  const share = async () => {
    try {
      await Share.share({ message: `${episode.title} — ${podcast.title}${podcast.website ? `\n${podcast.website}` : ''}` });
    } catch {
      useToast.getState().show("Sharing isn't available here");
    }
  };

  const baseItems: MenuItem[] = [
    state.downloadedUri
      ? { label: 'Remove download', icon: 'delete-outline', onPress: () => useDownloads.getState().remove(podcast.id, episode.id) }
      : { label: downloading ? 'Downloading…' : 'Download', icon: 'file-download', disabled: !downloadsSupported || downloading, onPress: () => useDownloads.getState().download(episode, podcast) },
    { label: 'Play next', icon: 'queue-music', onPress: () => queueIt('first') },
    { label: 'Play last', icon: 'playlist-add-check', onPress: () => queueIt('last') },
    { label: 'Add to playlist…', icon: 'playlist-add', onPress: () => setPlaylistOpen(true) },
    {
      label: 'Transcript',
      icon: 'subject',
      disabled: !episode.transcriptUrl,
      onPress: () => episode.transcriptUrl && void Linking.openURL(episode.transcriptUrl),
    },
    { label: 'Go to podcast', icon: 'podcasts', onPress: () => goToPodcast(podcast.id, onClose) },
    { label: 'Add bookmark', icon: 'bookmark-add', onPress: addBookmark },
    {
      label: state.played ? 'Mark as unplayed' : 'Mark as played',
      icon: 'done-all',
      onPress: () => lib.patchEpisode(key, { played: !state.played, progressMs: 0 }),
    },
    {
      label: state.archived ? 'Unarchive' : 'Archive',
      icon: 'archive',
      onPress: () => lib.patchEpisode(key, { archived: !state.archived }),
    },
  ];
  const menuItems = baseItems.map((i) => ({ ...i, onPress: () => { setSheet(null); i.onPress(); } }));

  // The three tabs sit side by side in a pager that follows your finger.
  const playingPanel = (
        <View style={styles.body}>
          {!isCurrent ? (
            <View style={styles.previewTop}>
              <Draggable drag={isSheet ? sheetDrag : undefined} style={styles.previewHead}>
                <Artwork uri={episode.artwork ?? podcast.artwork} title={podcast.title} size={88} radius={14} />
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText type="small" style={{ color: MUTED }}>
                    {[episodeDateLabel(episode.published), durationLabel(episode.durationSec)].filter(Boolean).join(' · ')}
                  </ThemedText>
                  <ThemedText type="smallBold" style={styles.detailTitle} numberOfLines={3} accessibilityRole="header">
                    {episode.title}
                  </ThemedText>
                  <Pressable accessibilityRole="link" onPress={() => goToPodcast(podcast.id, onClose)}>
                    <ThemedText type="small" style={{ color: ACCENT }} numberOfLines={1}>
                      {podcast.title}
                    </ThemedText>
                  </Pressable>
                </View>
              </Draggable>
              <ScrollView style={styles.notesPanel} contentContainerStyle={styles.notesContent} accessibilityLabel="Show notes">
                <ThemedText style={styles.notes}>{stripHtml(episode.description) || notesFallback}</ThemedText>
              </ScrollView>
            </View>
          ) : (
            <Draggable drag={isSheet ? sheetDrag : undefined} style={styles.fillArea}>
              <View style={styles.artWrap}>
                <Artwork uri={episode.artwork ?? podcast.artwork} title={podcast.title} radius={18} style={styles.art} />
              </View>
              <View style={styles.titles}>
            <ThemedText type="subtitle" style={styles.title} numberOfLines={3} accessibilityRole="header">
              {episode.title}
            </ThemedText>
            <Pressable accessibilityRole="link" onPress={() => goToPodcast(podcast.id, onClose)}>
              <ThemedText style={styles.podcastName} numberOfLines={1}>
                {podcast.title}
              </ThemedText>
            </Pressable>
          </View>
            </Draggable>
          )}

          <SwipeIgnore style={styles.scrubWrap}>
            <Slider
              accessibilityLabel="Seek"
              style={styles.slider}
              disabled={!isCurrent}
              minimumValue={0}
              maximumValue={Math.max(duration, 1)}
              value={position}
              minimumTrackTintColor="#fff"
              maximumTrackTintColor="rgba(255,255,255,0.25)"
              thumbTintColor="#fff"
              onValueChange={setScrub}
              onSlidingComplete={(v) => {
                setScrub(null);
                usePlayer.getState().seekTo(v);
              }}
            />
            <View style={styles.times}>
              <ThemedText type="small" style={styles.time}>{formatClock(position)}</ThemedText>
              <ThemedText type="small" style={styles.time}>-{formatClock(Math.max(0, duration - position))}</ThemedText>
            </View>
          </SwipeIgnore>

          <View style={styles.controls}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Skip back ${skipBack} seconds`} disabled={!isCurrent} onPress={() => usePlayer.getState().skipBack()} hitSlop={10} style={!isCurrent ? styles.dim : undefined}>
              <SkipIcon direction="back" seconds={skipBack} size={56} color="#fff" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={isCurrent && playing ? 'Pause' : 'Play'} onPress={playPause} style={styles.bigPlay}>
              <Icon name={isCurrent && playing ? 'pause' : 'play-arrow'} size={56} color={BG} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Skip forward ${skipForward} seconds`} disabled={!isCurrent} onPress={() => usePlayer.getState().skipForward()} hitSlop={10} style={!isCurrent ? styles.dim : undefined}>
              <SkipIcon direction="forward" seconds={skipForward} size={56} color="#fff" />
            </Pressable>
          </View>
          {isCurrent && buffering && playing ? <ThemedText type="small" style={[styles.time, styles.center]}>Buffering…</ThemedText> : null}

          <View style={[styles.bar, { marginBottom: insets.bottom + 12 }]}>
            <BarButton name="speed" label={`Playback speed ${formatRate(rate)}`} text={rate === 1 ? undefined : formatRate(rate)} active={rate !== 1} onPress={() => setSheet('speed')} />
            <BarButton name="bedtime" label="Sleep timer" active={sleep !== null} onPress={() => setSheet('sleep')} />
            <BarButton name={state.starred ? 'star' : 'star-border'} label={state.starred ? 'Unstar' : 'Star'} active={state.starred} onPress={() => lib.patchEpisode(key, { starred: !state.starred })} />
            <BarButton name="share" label="Share" onPress={() => void share()} />
            <BarButton name="more-vert" label="More" onPress={() => setSheet('menu')} />
          </View>
        </View>
  );
  const detailsPanel = (
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
            <>
              <View style={styles.detailHead}>
                <Artwork uri={episode.artwork ?? podcast.artwork} title={podcast.title} size={72} radius={10} />
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText type="small" style={{ color: MUTED }}>
                    {[episodeDateLabel(episode.published), durationLabel(episode.durationSec)].filter(Boolean).join(' · ')}
                  </ThemedText>
                  <ThemedText type="smallBold" style={styles.detailTitle}>{episode.title}</ThemedText>
                  <Pressable accessibilityRole="link" onPress={() => goToPodcast(podcast.id, onClose)}>
                    <ThemedText type="small" style={{ color: ACCENT }}>{podcast.title}</ThemedText>
                  </Pressable>
                </View>
              </View>
              {!isCurrent ? (
                <Pressable accessibilityRole="button" onPress={playPause} style={styles.playCta}>
                  <Icon name="play-arrow" size={26} color={BG} />
                  <ThemedText type="smallBold" style={{ color: BG }}>
                    {state.progressMs > 0 && !state.played ? 'Resume' : 'Play'}
                  </ThemedText>
                </Pressable>
              ) : null}
              <ThemedText style={styles.notes}>{stripHtml(episode.description) || notesFallback}</ThemedText>
            </>
      </ScrollView>
  );
  const bookmarksPanel = (
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
            <>
              <Pressable accessibilityRole="button" onPress={addBookmark} style={[styles.playCta, !isCurrent ? { opacity: 0.4 } : null]}>
                <Icon name="bookmark-add" size={22} color={BG} />
                <ThemedText type="smallBold" style={{ color: BG }}>Add bookmark at {formatClock(isCurrent ? positionSec : 0)}</ThemedText>
              </Pressable>
              {epBookmarks.length === 0 ? (
                <ThemedText style={styles.empty}>No bookmarks yet. Tap above to save your place.</ThemedText>
              ) : (
                epBookmarks.map((b) => (
                  <View key={b.id} style={styles.bookmark}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Play from ${formatClock(b.timeSec)}`}
                      onPress={() => {
                        usePlayer.getState().play(episode, podcast);
                        usePlayer.getState().seekTo(b.timeSec);
                        setTab('playing');
                      }}
                      style={styles.bookmarkMain}>
                      <Icon name="bookmark" size={22} color={ACCENT} />
                      <ThemedText style={{ color: '#fff' }}>{formatClock(b.timeSec)}</ThemedText>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Delete bookmark" hitSlop={8} onPress={() => useBookmarks.getState().remove(b.id)}>
                      <Icon name="delete-outline" size={22} color={MUTED} />
                    </Pressable>
                  </View>
                ))
              )}
            </>
      </ScrollView>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Header tab={tab} tabs={tabList} onTab={setTab} onClose={onClose} onQueue={openQueue} drag={isSheet ? sheetDrag : undefined} pagerX={pagerX} pageWidth={pageWidth} />

      <TabPager tabs={tabList} tab={tab} onTab={setTab} x={pagerX} panels={{ playing: playingPanel, details: detailsPanel, bookmarks: bookmarksPanel }} />

      <SpeedSheet visible={sheet === 'speed'} rate={rate} onChange={(r) => usePlayer.getState().setRate(r)} onClose={() => setSheet(null)} />
      <SleepSheet visible={sheet === 'sleep'} sleep={sleep} now={now} onChoose={(o) => usePlayer.getState().setSleep(o)} onClose={() => setSheet(null)} />
      <AddToPlaylistSheet visible={playlistOpen} refs={[toRef(episode, podcast)]} onClose={() => setPlaylistOpen(false)} />
      <MenuSheet visible={sheet === 'menu'} items={menuItems} anchor="bottom" dark onClose={() => setSheet(null)} />
    </View>
  );
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function goToPodcast(id: string, leave: () => void) {
  leave();
  router.push({ pathname: '/(tabs)/(podcasts)/podcast/[id]', params: { id } });
}

const TAB_LABEL: Record<Tab, string> = { playing: 'Playing', details: 'Details', bookmarks: 'Bookmarks' };

function Header({
  tab,
  tabs,
  onTab,
  onClose,
  onQueue,
  drag,
  pagerX,
  pageWidth = 1,
}: {
  tab: Tab;
  tabs: Tab[];
  onTab: (t: Tab) => void;
  onClose: () => void;
  onQueue?: () => void;
  drag?: ReturnType<typeof usePlayerSheetDrag>;
  /** The pager's live offset: the tab labels and underline follow it while you swipe. */
  pagerX?: SharedValue<number>;
  pageWidth?: number;
}) {
  const row = (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close player" onPress={onClose} hitSlop={10} style={styles.close}>
        <Icon name="keyboard-arrow-down" size={32} color="#fff" />
      </Pressable>
      <TabStrip tab={tab} tabs={tabs} onTab={onTab} pagerX={pagerX} pageWidth={pageWidth} />
      {onQueue ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Up Next" onPress={onQueue} hitSlop={10} style={styles.queue}>
          <Icon name="queue-music" size={26} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
  // In the sheet, dragging the header pushes the player down in real time.
  return drag ? <GestureDetector gesture={drag}>{row}</GestureDetector> : row;
}

/** The tab labels with an underline that slides along with the pager as you swipe (no waiting for it to settle). */
function TabStrip({ tab, tabs, onTab, pagerX, pageWidth }: { tab: Tab; tabs: Tab[]; onTab: (t: Tab) => void; pagerX?: SharedValue<number>; pageWidth: number }) {
  const layouts = useSharedValue<{ x: number; w: number }[]>([]);
  const own = useSharedValue(0);
  const offset = pagerX ?? own;
  const index = Math.max(0, tabs.indexOf(tab));
  useEffect(() => {
    if (!pagerX) own.set(-index * pageWidth);
  }, [pagerX, own, index, pageWidth]);

  const count = tabs.length;
  const underline = useAnimatedStyle(() => {
    const ls = layouts.get();
    const f = Math.min(count - 1, Math.max(0, -offset.get() / pageWidth));
    // Hidden until every label has been measured (labels report their size in any order).
    for (let i = 0; i < count; i++) {
      if (!ls[i] || ls[i].w === 0) return { opacity: 0 };
    }
    if (count < 2) return { opacity: 1, left: ls[0].x, width: ls[0].w };
    // Slide between the two neighbouring labels. (No inline arrow functions in here: they would be
    // hoisted out of the worklet and can't be called on the UI thread.)
    const lo = Math.min(count - 2, Math.floor(f));
    const t = f - lo;
    return { opacity: 1, left: ls[lo].x + (ls[lo + 1].x - ls[lo].x) * t, width: ls[lo].w + (ls[lo + 1].w - ls[lo].w) * t };
  });

  return (
    <View style={styles.tabs}>
      {tabs.map((t, i) => (
        <Pressable
          key={t}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === t }}
          onPress={() => onTab(t)}
          onLayout={(e) => {
            const { x, width } = e.nativeEvent.layout;
            const next = [];
            const prev = layouts.get();
            for (let j = 0; j < tabs.length; j++) next.push(j === i ? { x, w: width } : (prev[j] ?? { x: 0, w: 0 }));
            layouts.set(next);
          }}
          style={styles.tab}>
          <TabLabel text={TAB_LABEL[t]} index={i} offset={offset} pageWidth={pageWidth} />
        </Pressable>
      ))}
      <Animated.View pointerEvents="none" style={[styles.underline, underline]} />
    </View>
  );
}

function TabLabel({ text, index, offset, pageWidth }: { text: string; index: number; offset: SharedValue<number>; pageWidth: number }) {
  const style = useAnimatedStyle(() => ({ opacity: interpolate(-offset.get() / pageWidth, [index - 1, index, index + 1], [0.65, 1, 0.65], 'clamp') }));
  return (
    <Animated.View style={style}>
      <ThemedText type="smallBold" style={{ color: '#fff', fontSize: 16 }}>
        {text}
      </ThemedText>
    </Animated.View>
  );
}

/** Lets a part of the player be dragged down to collapse it into the mini player. */
function Draggable({ drag, style, children }: { drag?: ReturnType<typeof usePlayerSheetDrag>; style?: object; children: ReactNode }) {
  const view = <View style={style}>{children}</View>;
  return drag ? <GestureDetector gesture={drag}>{view}</GestureDetector> : view;
}

function BarButton({ name, label, text, active, onPress }: { name: IconName; label: string; text?: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={styles.barButton}>
      <Icon name={name} size={26} color={active ? ACCENT : MUTED} />
      {text ? <ThemedText type="small" style={{ color: ACCENT, fontSize: 11, fontWeight: '700' }}>{text}</ThemedText> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  queue: { marginLeft: 'auto', paddingHorizontal: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 56 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 4, position: 'relative' },
  tab: { paddingHorizontal: 10, paddingVertical: 8, paddingBottom: 11 },
  underline: { position: 'absolute', bottom: 0, height: 3, backgroundColor: '#fff' },
  body: { flex: 1, paddingHorizontal: 20, justifyContent: 'space-between' },
  artWrap: { flex: 1, justifyContent: 'center', paddingVertical: 8 },
  art: { alignSelf: 'center', width: '100%', maxWidth: 380, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  titles: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  title: { color: '#fff', textAlign: 'center', fontSize: 22, lineHeight: 28 },
  podcastName: { color: MUTED, fontSize: 16 },
  scrubWrap: { paddingTop: 4 },
  slider: { width: '100%', height: 36 },
  times: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  time: { color: MUTED },
  center: { textAlign: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  bigPlay: { width: 92, height: 92, borderRadius: 46, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 18, paddingVertical: 10 },
  barButton: { width: 56, height: 48, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, gap: 16 },
  detailHead: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  detailTitle: { color: '#fff', fontSize: 17, lineHeight: 23 },
  playCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 26, paddingVertical: 12 },
  dim: { opacity: 0.35 },
  fillArea: { flex: 1 },
  previewTop: { flex: 1, gap: 12, paddingTop: 8 },
  previewHead: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  notesPanel: { flex: 1, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' },
  notesContent: { padding: 14 },
  notes: { color: 'rgba(255,255,255,0.85)', lineHeight: 24 },
  empty: { color: MUTED, textAlign: 'center', padding: 32 },
  bookmark: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.15)' },
  bookmarkMain: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
});
