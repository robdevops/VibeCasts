import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, View } from 'react-native';

import { ELASTIC_SCROLL } from '@/constants/scroll';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { confirmAsync } from '@/components/ui/confirm';
import { Artwork } from '@/components/ui/artwork';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/hooks/use-theme';
import { downloadsSupported, useDownloads, type DownloadEntry } from '@/downloads/download-manager';
import { useLibrary } from '@/store/library';
import { formatMegabytes } from '@/lib/text';

type Row = { key: string; entry: DownloadEntry; status: 'queued' | 'downloading' | 'failed' | 'done'; auto: boolean };
type Section = { title: string; data: Row[] };

const megabytes = (b?: number) => (b ? formatMegabytes(b) : '');
const newestFirst = (a: Row, b: Row) => b.entry.episode.published - a.entry.episode.published;

export default function DownloadsScreen() {
  const theme = useTheme();
  const entries = useDownloads((s) => s.entries);
  const active = useDownloads((s) => s.active);
  const failed = useDownloads((s) => s.failed);
  const states = useLibrary((s) => s.episodes);

  const { sections, doneCount, total } = useMemo(() => {
    const going: Row[] = [];
    const broken: Row[] = [];
    const done: Row[] = [];
    for (const [key, entry] of Object.entries(entries)) {
      const st = states[key];
      const auto = !!st?.autoDownloaded;
      if (active[key]) going.push({ key, entry, status: active[key], auto });
      else if (st?.downloadedUri) done.push({ key, entry, status: 'done', auto });
      else if (failed[key]) broken.push({ key, entry, status: 'failed', auto });
      // Anything else was interrupted (e.g. the app closed mid-download) and is not shown.
    }
    // Downloading ones first, then the ones waiting their turn.
    going.sort((a, b) => (a.status === b.status ? newestFirst(a, b) : a.status === 'downloading' ? -1 : 1));
    const out: Section[] = [];
    if (going.length) out.push({ title: 'Currently downloading', data: going });
    if (broken.length) out.push({ title: 'Failed', data: broken.sort(newestFirst) });
    if (done.length) out.push({ title: 'Downloaded', data: done.sort(newestFirst) });
    return { sections: out, doneCount: done.length, total: done.reduce((n, r) => n + (r.entry.sizeBytes ?? 0), 0) };
  }, [entries, states, active, failed]);

  const removeAll = async () => {
    if (await confirmAsync('Delete all downloads?', 'The downloaded files are removed. Your progress is kept.', 'Delete all')) {
      useDownloads.getState().removeAll();
    }
  };

  const retry = (row: Row) => {
    const { podcast, episode } = row.entry;
    useDownloads.getState().download({ ...episode, description: '' }, { ...podcast, feedUrl: podcast.feedUrl }, { auto: row.auto });
  };

  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader title="Downloads" back />
      {sections.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
            {downloadsSupported
              ? 'Episodes you download will show up here, ready to play offline.'
              : 'Downloads are available in the Android and iOS apps.'}
          </ThemedText>
        </View>
      ) : (
        <SectionList
          {...ELASTIC_SCROLL}
          sections={sections}
          keyExtractor={(r) => r.key}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={styles.summary}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={{ flex: 1, letterSpacing: 0.6 }}>
                {section.title.toUpperCase()}
                {section.title === 'Downloaded' ? `  ·  ${doneCount}${total ? ` · ${megabytes(total)}` : ''}` : ''}
              </ThemedText>
              {section.title === 'Downloaded' ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Delete all downloads" onPress={() => void removeAll()}>
                  <ThemedText type="smallBold" style={{ color: theme.accent }}>
                    Delete all
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          )}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderBottomColor: theme.border }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.entry.episode.title}
                style={styles.body}
                onPress={() => router.push({ pathname: '/episode', params: { podcastId: item.entry.podcast.id, episodeId: item.entry.episode.id } })}>
                <Artwork uri={item.entry.podcast.artwork} title={item.entry.podcast.title} size={52} radius={8} />
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {item.entry.episode.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {item.entry.podcast.title}
                    {item.status === 'downloading' ? ' · downloading…' : ''}
                    {item.status === 'queued' ? ' · waiting' : ''}
                    {item.status === 'failed' ? ' · failed' : ''}
                    {item.status === 'done' && item.entry.sizeBytes ? ` · ${megabytes(item.entry.sizeBytes)}` : ''}
                    {item.status === 'done' && item.auto ? ' · auto' : ''}
                  </ThemedText>
                </View>
              </Pressable>
              {item.status === 'downloading' ? (
                <ActivityIndicator color={theme.accent} />
              ) : item.status === 'queued' ? (
                <Icon name="schedule" size={22} color={theme.textSecondary} />
              ) : item.status === 'failed' ? (
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Retry download of ${item.entry.episode.title}`} hitSlop={8} onPress={() => retry(item)}>
                    <Icon name="refresh" size={24} color={theme.accent} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} onPress={() => useDownloads.getState().remove(item.entry.podcast.id, item.entry.episode.id)}>
                    <Icon name="close" size={22} color={theme.textSecondary} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete download of ${item.entry.episode.title}`}
                  hitSlop={10}
                  onPress={() => useDownloads.getState().remove(item.entry.podcast.id, item.entry.episode.id)}>
                  <Icon name="delete-outline" size={24} color={theme.textSecondary} />
                </Pressable>
              )}
            </View>
          )}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  summary: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
