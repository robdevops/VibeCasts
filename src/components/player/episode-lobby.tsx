import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Episode, Podcast } from '@/api/types';
import { AddToPlaylistSheet } from '@/components/playlists/add-to-playlist-sheet';
import { ThemedText } from '@/components/themed-text';
import { Artwork } from '@/components/ui/artwork';
import { Icon, type IconName } from '@/components/ui/icon';
import { MenuSheet, type MenuItem } from '@/components/ui/menu-sheet';
import { AFTER_CLOSE_MS, SlideUpFrame, useSlideDismissGesture } from '@/components/ui/slide-up-frame';
import { ELASTIC_SCROLL } from '@/constants/scroll';
import { downloadsSupported, useDownloads } from '@/downloads/download-manager';
import { useTheme } from '@/hooks/use-theme';
import { durationLabel } from '@/lib/episode-list';
import { emptyEpisodeState, episodeKey, timeLeftLabel } from '@/lib/episode-state';
import { formatClock } from '@/lib/player-math';
import { toRef } from '@/lib/playlist';
import { stripHtml } from '@/lib/text';
import { bookmarksForEpisode, useBookmarks } from '@/store/bookmarks';
import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';
import { usePlayer } from '@/store/player';
import { usePlaylists } from '@/store/playlists';
import { useToast } from '@/store/toast';

type Tab = 'details' | 'bookmarks';

/** The episode route: a lobby for any episode (opened from a list), slid up over the app. */
export default function EpisodeLobbyScreen() {
  const params = useLocalSearchParams<{ podcastId?: string; episodeId?: string }>();
  return (
    <SlideUpFrame>
      <EpisodeLobby podcastId={params.podcastId} episodeId={params.episodeId} />
    </SlideUpFrame>
  );
}

function closeLobby() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

const megabytes = (bytes: number) => `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
const fullDate = (ms: number) => (ms > 0 ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/** Find the episode being looked at (from the cached or full feed), fetching the feed when its show notes are missing. */
function useViewedEpisode(podcastId?: string, episodeId?: string) {
  const current = usePlayer((s) => s.current);
  const full = useFeeds((s) => (podcastId ? s.full[podcastId] : undefined));
  const cached = useFeeds((s) => (podcastId ? s.feeds[podcastId] : undefined));
  const known = useFeeds((s) => (podcastId ? s.known[podcastId] : undefined));
  const subscribed = useLibrary((s) => (podcastId ? s.subscriptions[podcastId]?.podcast : undefined));
  const feedLoading = useFeeds((s) => (podcastId ? !!s.loading[podcastId] : false));

  const viewed = useMemo<{ podcast: Podcast; episode: Episode } | null>(() => {
    if (!podcastId || !episodeId) return null;
    const podcast = subscribed ?? known ?? (current?.podcast.id === podcastId ? current.podcast : undefined);
    const episode =
      (full?.episodes ?? cached?.episodes)?.find((e) => e.id === episodeId) ?? (current?.episode.id === episodeId ? current.episode : undefined);
    return podcast && episode ? { podcast, episode } : null;
  }, [podcastId, episodeId, subscribed, known, full, cached, current]);

  // The saved feed cache leaves out show notes: fetch the feed when about to show an episode without them (or an older one).
  const needsNotes = !!viewed && !viewed.episode.description && !full;
  const missing = !viewed && !!episodeId && !full;
  const feedPodcast = viewed?.podcast ?? subscribed ?? known;
  const notesKey = viewed ? `${viewed.podcast.id}|${viewed.episode.id}` : (episodeId ?? '');
  const [failedFor, setFailedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!(needsNotes || missing) || !feedPodcast || feedLoading || failedFor === notesKey) return;
    void useFeeds
      .getState()
      .refresh(feedPodcast)
      .then(() => {
        if (!useFeeds.getState().full[feedPodcast.id]) setFailedFor(notesKey);
      });
  }, [needsNotes, missing, feedPodcast, feedLoading, failedFor, notesKey]);
  const notesFallback = failedFor === notesKey ? 'Couldn’t load show notes.' : feedLoading || needsNotes ? 'Loading show notes…' : 'No show notes for this episode.';
  return { viewed, notesFallback };
}

function EpisodeLobby({ podcastId, episodeId }: { podcastId?: string; episodeId?: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const dismiss = useSlideDismissGesture();
  const { viewed, notesFallback } = useViewedEpisode(podcastId, episodeId);
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const bookmarks = useBookmarks((s) => s.items);
  const [tab, setTab] = useState<Tab>('details');
  const [addMenu, setAddMenu] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  const key = viewed ? episodeKey(viewed.podcast.id, viewed.episode.id) : '';
  const state = useLibrary((s) => s.episodes[key]) ?? emptyEpisodeState;
  const downloading = useDownloads((s) => !!s.active[key]);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={closeLobby} style={styles.close}>
          <Icon name="keyboard-arrow-down" size={32} color={theme.accent} />
        </Pressable>
        {(['details', 'bookmarks'] as const).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            onPress={() => setTab(t)}
            style={[styles.tab, { borderBottomColor: tab === t ? theme.accent : 'transparent' }]}>
            <ThemedText type="smallBold" style={{ color: theme.accent, fontSize: 17 }}>
              {t === 'details' ? 'Details' : 'Bookmarks'}
            </ThemedText>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        {viewed ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={state.starred ? 'Unstar' : 'Star'}
              hitSlop={8}
              onPress={() => useLibrary.getState().patchEpisode(key, { starred: !state.starred })}
              style={styles.headerIcon}>
              <Icon name={state.starred ? 'star' : 'star-border'} size={26} color={theme.accent} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Share" hitSlop={8} onPress={() => void share(viewed.episode, viewed.podcast)} style={styles.headerIcon}>
              <Icon name="share" size={24} color={theme.accent} />
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );

  const frame = (body: React.ReactNode) => (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {dismiss ? <GestureDetector gesture={dismiss}>{header}</GestureDetector> : header}
      {body}
    </View>
  );

  if (!viewed) {
    return frame(
      <View style={styles.centered}>
        <ThemedText themeColor="textSecondary">Loading episode…</ThemedText>
      </View>,
    );
  }

  const { podcast, episode } = viewed;
  const isCurrent = current?.episode.id === episode.id && current.podcast.id === podcast.id;
  const duration = episode.durationSec;
  const inProgress = state.progressMs > 0 && !state.played;
  const fraction = state.played ? 1 : duration > 0 ? Math.min(1, state.progressMs / 1000 / duration) : 0;
  const artSize = Math.min(Math.round(width * 0.5), 240);
  const lib = useLibrary.getState();

  const play = () => {
    if (isCurrent && playing) {
      usePlayer.getState().pause(); // already playing: just pause, stay here
      return;
    }
    if (isCurrent) usePlayer.getState().toggle();
    else usePlayer.getState().play(episode, podcast);
    closeLobby(); // back to the list, with the mini player
  };

  const goToPodcast = () => {
    closeLobby();
    // Wait for the page to finish sliding away, or the push would land before the (held back) close.
    setTimeout(() => router.push({ pathname: '/(tabs)/(podcasts)/podcast/[id]', params: { id: podcast.id } }), AFTER_CLOSE_MS);
  };

  const queueIt = (where: 'first' | 'last') => {
    const refs = [toRef(episode, podcast)];
    if (where === 'first') usePlaylists.getState().playNext(refs);
    else usePlaylists.getState().playLast(refs);
    useToast.getState().show(where === 'first' ? 'Will play next' : 'Added to Up Next');
  };

  const addBase: MenuItem[] = [
    { label: 'Play next', icon: 'queue-music', onPress: () => queueIt('first') },
    { label: 'Play last', icon: 'playlist-add-check', onPress: () => queueIt('last') },
    { label: 'Add to playlist…', icon: 'playlist-add', onPress: () => setPlaylistOpen(true) },
  ];
  const addItems: MenuItem[] = addBase.map((i) => ({ ...i, onPress: () => { setAddMenu(false); i.onPress(); } }));

  const action = (icon: IconName, label: string, onPress: () => void, disabled = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.action, { opacity: disabled ? 0.4 : 1 }]}>
      <Icon name={icon} size={26} color={theme.accent} />
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={{ textAlign: 'center' }}>
        {label}
      </ThemedText>
    </Pressable>
  );

  const downloadLabel = state.downloadedUri ? 'Downloaded' : downloading ? 'Downloading…' : episode.sizeBytes ? megabytes(episode.sizeBytes) : 'Download';

  const details = (
    <ScrollView
      {...ELASTIC_SCROLL}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      onScrollEndDrag={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
        // iOS: pulling the top of the page down past the edge dismisses it, like the drag on the header.
        if (e.nativeEvent.contentOffset.y < -90) closeLobby();
      }}>
      <View style={styles.artWrap}>
        <Artwork uri={episode.artwork ?? podcast.artwork} title={podcast.title} size={artSize} radius={12} style={styles.artShadow} />
      </View>
      <ThemedText type="title" style={styles.title} accessibilityRole="header">
        {episode.title}
      </ThemedText>
      <Pressable accessibilityRole="link" accessibilityLabel={`Go to ${podcast.title}`} onPress={goToPodcast} style={styles.showLink}>
        <ThemedText type="subtitle" style={{ color: theme.accent, fontSize: 20, lineHeight: 26, flexShrink: 1 }} numberOfLines={1}>
          {podcast.title}
        </ThemedText>
        <Icon name="chevron-right" size={26} color={theme.accent} />
      </Pressable>

      <View style={styles.playBlock}>
        <View style={[styles.line, { backgroundColor: theme.border }]} />
        <View style={styles.actions}>
          {action(state.downloadedUri ? 'delete-outline' : 'file-download', downloadLabel, () => {
            if (state.downloadedUri) useDownloads.getState().remove(podcast.id, episode.id);
            else useDownloads.getState().download(episode, podcast);
          }, !downloadsSupported || downloading)}
          {action('add', 'Add', () => setAddMenu(true))}
          <View style={styles.actionGap} />
          {action('check-circle-outline', state.played ? 'Mark Unplayed' : 'Mark Played', () => lib.patchEpisode(key, { played: !state.played, progressMs: 0 }))}
          {action(state.archived ? 'unarchive' : 'archive', state.archived ? 'Unarchive' : 'Archive', () => lib.patchEpisode(key, { archived: !state.archived }))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isCurrent && playing ? 'Pause' : inProgress ? 'Resume' : 'Play'}
          onPress={play}
          style={[styles.playButton, { backgroundColor: theme.accent }]}>
          <Icon name={isCurrent && playing ? 'pause' : 'play-arrow'} size={48} color="#fff" />
        </Pressable>
      </View>

      <View style={[styles.track, { backgroundColor: theme.border }]}>
        <View style={{ width: `${Math.round(fraction * 100)}%`, height: 3, backgroundColor: theme.accent }} />
      </View>

      <View style={styles.dateRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {fullDate(episode.published)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {inProgress ? timeLeftLabel(state, duration) : durationLabel(duration)}
        </ThemedText>
      </View>

      {episode.transcriptUrl ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => episode.transcriptUrl && void Linking.openURL(episode.transcriptUrl)}
          style={[styles.transcript, { backgroundColor: theme.backgroundElement }]}>
          <Icon name="auto-awesome" size={22} color={theme.accent} />
          <ThemedText style={{ flex: 1 }}>View transcript</ThemedText>
          <Icon name="chevron-right" size={22} color={theme.textSecondary} />
        </Pressable>
      ) : null}

      <ThemedText style={styles.notes}>{stripHtml(episode.description) || notesFallback}</ThemedText>
    </ScrollView>
  );

  const epBookmarks = bookmarksForEpisode(bookmarks, podcast.id, episode.id);
  const bookmarksPanel = (
    <ScrollView {...ELASTIC_SCROLL} contentContainerStyle={[styles.bookmarks, { paddingBottom: insets.bottom + 24 }]}>
      {epBookmarks.length === 0 ? (
        <ThemedText themeColor="textSecondary" style={styles.noBookmarks}>
          No bookmarks yet. Add one from the player while this episode plays.
        </ThemedText>
      ) : (
        epBookmarks.map((b) => (
          <View key={b.id} style={[styles.bookmark, { borderBottomColor: theme.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Play from ${formatClock(b.timeSec)}`}
              onPress={() => {
                usePlayer.getState().play(episode, podcast);
                usePlayer.getState().seekTo(b.timeSec);
                closeLobby();
              }}
              style={styles.bookmarkMain}>
              <Icon name="bookmark" size={22} color={theme.accent} />
              <ThemedText>{formatClock(b.timeSec)}</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Delete bookmark" hitSlop={8} onPress={() => useBookmarks.getState().remove(b.id)}>
              <Icon name="delete-outline" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );

  return frame(
    <>
      {tab === 'details' ? details : bookmarksPanel}
      <MenuSheet visible={addMenu} items={addItems} onClose={() => setAddMenu(false)} />
      <AddToPlaylistSheet visible={playlistOpen} refs={[toRef(episode, podcast)]} onClose={() => setPlaylistOpen(false)} />
    </>,
  );
}

async function share(episode: Episode, podcast: Podcast) {
  try {
    await Share.share({ message: `${episode.title} — ${podcast.title}${podcast.website ? `\n${podcast.website}` : ''}` });
  } catch {
    useToast.getState().show("Sharing isn't available here");
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 12 },
  headerRow: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 6 },
  close: { width: 40, alignItems: 'center' },
  tab: { paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 3 },
  headerIcon: { paddingHorizontal: 8 },
  artWrap: { alignItems: 'center', marginTop: 8 },
  artShadow: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  title: { textAlign: 'center', fontSize: 26, lineHeight: 32, marginTop: 22, paddingHorizontal: 24 },
  showLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: 10, paddingHorizontal: 24 },
  playBlock: { marginTop: 18, paddingTop: 44 },
  line: { position: 'absolute', left: 0, right: 0, top: 44, height: StyleSheet.hairlineWidth },
  playButton: { position: 'absolute', top: 0, alignSelf: 'center', width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 16, paddingBottom: 14, paddingHorizontal: 4 },
  action: { flex: 1, alignItems: 'center', gap: 4 },
  actionGap: { width: 96 },
  track: { height: 3 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 22 },
  transcript: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 18, marginTop: 16, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12 },
  notes: { paddingHorizontal: 18, paddingTop: 18, fontSize: 18, lineHeight: 28 },
  bookmarks: { paddingHorizontal: 18, paddingTop: 8 },
  noBookmarks: { textAlign: 'center', paddingTop: 40, paddingHorizontal: 24 },
  bookmark: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  bookmarkMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
