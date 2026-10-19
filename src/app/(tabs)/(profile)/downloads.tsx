import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Artwork } from '@/components/ui/artwork';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/hooks/use-theme';
import { downloadsSupported, useDownloads, type DownloadEntry } from '@/downloads/download-manager';
import { confirmAsync } from '@/components/ui/confirm';
import { useLibrary } from '@/store/library';

type Row = { key: string; entry: DownloadEntry; downloading: boolean; failed: boolean; auto: boolean };

const megabytes = (b?: number) => (b ? `${Math.max(1, Math.round(b / 1_000_000))} MB` : '');

export default function DownloadsScreen() {
  const theme = useTheme();
  const entries = useDownloads((s) => s.entries);
  const active = useDownloads((s) => s.active);
  const failed = useDownloads((s) => s.failed);
  const states = useLibrary((s) => s.episodes);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const [key, entry] of Object.entries(entries)) {
      const st = states[key];
      if (st?.downloadedUri || active[key] || failed[key]) {
        out.push({ key, entry, downloading: !!active[key], failed: !!failed[key] && !st?.downloadedUri, auto: !!st?.autoDownloaded });
      }
    }
    return out.sort((a, b) => b.entry.episode.published - a.entry.episode.published);
  }, [entries, states, active, failed]);

  const total = rows.reduce((n, r) => n + (r.entry.sizeBytes ?? 0), 0);

  const removeAll = async () => {
    if (await confirmAsync('Delete all downloads?', 'The downloaded files are removed. Your progress is kept.', 'Delete all')) {
      useDownloads.getState().removeAll();
    }
  };

  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader title="Downloads" back />
      {rows.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
            {downloadsSupported
              ? 'Episodes you download will show up here, ready to play offline.'
              : 'Downloads are available in the Android and iOS apps.'}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          ListHeaderComponent={
            <View style={styles.summary}>
              <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                {rows.length} episode{rows.length === 1 ? '' : 's'}
                {total ? ` · ${megabytes(total)}` : ''}
              </ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="Delete all downloads" onPress={() => void removeAll()}>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  Delete all
                </ThemedText>
              </Pressable>
            </View>
          }
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
                    {item.entry.sizeBytes ? ` · ${megabytes(item.entry.sizeBytes)}` : ''}
                    {item.auto ? ' · auto' : ''}
                    {item.failed ? ' · failed' : ''}
                  </ThemedText>
                </View>
              </Pressable>
              {item.downloading ? (
                <ActivityIndicator color={theme.accent} />
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
  summary: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
