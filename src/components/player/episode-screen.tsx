import Slider from '@react-native-community/slider';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Episode, Podcast } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Artwork } from '@/components/ui/artwork';
import { Icon, type IconName } from '@/components/ui/icon';
import { MenuSheet, type MenuItem } from '@/components/ui/menu-sheet';
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
import { SwipeIgnore, SwipeTabs } from './swipe-tabs';
import { SleepSheet } from './sleep-sheet';
import { SpeedSheet } from './speed-sheet';

const BG = '#2A0C0C';
const MUTED = 'rgba(255,255,255,0.65)';
const ACCENT = '#FF5A52';

type Tab = 'playing' | 'details' | 'bookmarks';
type Sheet = 'speed' | 'sleep' | 'menu' | null;

export default function EpisodeScreen() {
  const params = useLocalSearchParams<{ podcastId?: string; episodeId?: string }>();
  const insets = useSafeAreaInsets();

  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const positionSec = usePlayer((s) => s.positionSec);
  const durationSec = usePlayer((s) => s.durationSec);
  const rate = usePlayer((s) => s.rate);
  const sleep = usePlayer((s) => s.sleep);
  const skipBack = useSettings((s) => s.skipBackSec);
  const skipForward = useSettings((s) => s.skipForwardSec);
  const full = useFeeds((s) => (params.podcastId ? s.full[params.podcastId] : undefined));
  const cached = useFeeds((s) => (params.podcastId ? s.feeds[params.podcastId] : undefined));
  const known = useFeeds((s) => (params.podcastId ? s.known[params.podcastId] : undefined));
  const subscribed = useLibrary((s) => (params.podcastId ? s.subscriptions[params.podcastId]?.podcast : undefined));
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
    return current;
  }, [params.podcastId, params.episodeId, subscribed, known, full, cached, current]);

  const isCurrent = !!viewed && current?.episode.id === viewed.episode.id && current.podcast.id === viewed.podcast.id;
  const [tab, setTab] = useState<Tab>(isCurrent ? 'playing' : 'details');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tabList: Tab[] = isCurrent ? ['playing', 'details', 'bookmarks'] : ['details', 'bookmarks'];

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
        <Header tab="details" tabs={['details']} onTab={() => {}} onClose={close} />
        <ThemedText style={styles.empty}>Nothing is playing yet.</ThemedText>
      </View>
    );
  }

  const { podcast, episode } = viewed;
  const duration = isCurrent && durationSec > 0 ? durationSec : episode.durationSec;
  const position = isCurrent ? (scrub ?? positionSec) : 0;
  const epBookmarks = bookmarksForEpisode(bookmarks, podcast.id, episode.id);
  const lib = useLibrary.getState();

  const playPause = () => {
    if (isCurrent) usePlayer.getState().toggle();
    else {
      usePlayer.getState().play(episode, podcast);
      setTab('playing');
    }
  };

  const addBookmark = () => {
    if (!isCurrent) {
      useToast.getState().show('Play the episode to add a bookmark');
      return;
    }
    useBookmarks.getState().add(podcast.id, episode.id, positionSec);
    useToast.getState().show(`Bookmarked at ${formatClock(positionSec)}`);
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
    {
      label: 'Transcript',
      icon: 'subject',
      disabled: !episode.transcriptUrl,
      onPress: () => episode.transcriptUrl && void Linking.openURL(episode.transcriptUrl),
    },
    { label: 'Go to podcast', icon: 'podcasts', onPress: () => goToPodcast(podcast.id) },
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Header tab={tab} tabs={tabList} onTab={setTab} onClose={close} />

      <SwipeTabs tabs={tabList} tab={tab} onTab={setTab}>
      {tab === 'playing' && isCurrent ? (
        <View style={styles.body}>
          <View style={styles.artWrap}>
            <Artwork uri={episode.artwork ?? podcast.artwork} title={podcast.title} radius={18} style={styles.art} />
          </View>
          <View style={styles.titles}>
            <ThemedText type="subtitle" style={styles.title} numberOfLines={3} accessibilityRole="header">
              {episode.title}
            </ThemedText>
            <Pressable accessibilityRole="link" onPress={() => goToPodcast(podcast.id)}>
              <ThemedText style={styles.podcastName} numberOfLines={1}>
                {podcast.title}
              </ThemedText>
            </Pressable>
          </View>

          <SwipeIgnore style={styles.scrubWrap}>
            <Slider
              accessibilityLabel="Seek"
              style={styles.slider}
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
            <Pressable accessibilityRole="button" accessibilityLabel={`Skip back ${skipBack} seconds`} onPress={() => usePlayer.getState().skipBack()} hitSlop={10}>
              <SkipIcon direction="back" seconds={skipBack} size={56} color="#fff" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} onPress={playPause} style={styles.bigPlay}>
              <Icon name={playing ? 'pause' : 'play-arrow'} size={56} color={BG} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Skip forward ${skipForward} seconds`} onPress={() => usePlayer.getState().skipForward()} hitSlop={10}>
              <SkipIcon direction="forward" seconds={skipForward} size={56} color="#fff" />
            </Pressable>
          </View>
          {buffering && playing ? <ThemedText type="small" style={[styles.time, styles.center]}>Buffering…</ThemedText> : null}

          <View style={[styles.bar, { marginBottom: insets.bottom + 12 }]}>
            <BarButton name="speed" label={`Playback speed ${formatRate(rate)}`} text={rate === 1 ? undefined : formatRate(rate)} active={rate !== 1} onPress={() => setSheet('speed')} />
            <BarButton name="bedtime" label="Sleep timer" active={sleep !== null} onPress={() => setSheet('sleep')} />
            <BarButton name={state.starred ? 'star' : 'star-border'} label={state.starred ? 'Unstar' : 'Star'} active={state.starred} onPress={() => lib.patchEpisode(key, { starred: !state.starred })} />
            <BarButton name="share" label="Share" onPress={() => void share()} />
            <BarButton name="more-vert" label="More" onPress={() => setSheet('menu')} />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
          {tab === 'details' ? (
            <>
              <View style={styles.detailHead}>
                <Artwork uri={episode.artwork ?? podcast.artwork} title={podcast.title} size={72} radius={10} />
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText type="small" style={{ color: MUTED }}>
                    {[episodeDateLabel(episode.published), durationLabel(episode.durationSec)].filter(Boolean).join(' · ')}
                  </ThemedText>
                  <ThemedText type="smallBold" style={styles.detailTitle}>{episode.title}</ThemedText>
                  <Pressable accessibilityRole="link" onPress={() => goToPodcast(podcast.id)}>
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
              <ThemedText style={styles.notes}>{stripHtml(episode.description) || 'No show notes for this episode.'}</ThemedText>
            </>
          ) : (
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
          )}
        </ScrollView>
      )}
      </SwipeTabs>

      <SpeedSheet visible={sheet === 'speed'} rate={rate} onChange={(r) => usePlayer.getState().setRate(r)} onClose={() => setSheet(null)} />
      <SleepSheet visible={sheet === 'sleep'} sleep={sleep} now={now} onChoose={(o) => usePlayer.getState().setSleep(o)} onClose={() => setSheet(null)} />
      <MenuSheet visible={sheet === 'menu'} items={menuItems} anchor="bottom" dark onClose={() => setSheet(null)} />
    </View>
  );
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function goToPodcast(id: string) {
  close();
  router.push({ pathname: '/(tabs)/(podcasts)/podcast/[id]', params: { id } });
}

const TAB_LABEL: Record<Tab, string> = { playing: 'Playing', details: 'Details', bookmarks: 'Bookmarks' };

function Header({ tab, tabs, onTab, onClose }: { tab: Tab; tabs: Tab[]; onTab: (t: Tab) => void; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close player" onPress={onClose} hitSlop={10} style={styles.close}>
        <Icon name="keyboard-arrow-down" size={32} color="#fff" />
      </Pressable>
      <View style={styles.tabs}>
        {tabs.map((t) => (
          <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => onTab(t)} style={[styles.tab, tab === t ? styles.tabOn : null]}>
            <ThemedText type="smallBold" style={{ color: tab === t ? '#fff' : MUTED, fontSize: 16 }}>
              {TAB_LABEL[t]}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </View>
  );
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 56 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: '#fff' },
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
  notes: { color: 'rgba(255,255,255,0.85)', lineHeight: 24 },
  empty: { color: MUTED, textAlign: 'center', padding: 32 },
  bookmark: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.15)' },
  bookmarkMain: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
});
