import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { confirmAsync } from '@/components/ui/confirm';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Artwork } from '@/components/ui/artwork';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { MenuSheet, type MenuItem } from '@/components/ui/menu-sheet';
import { NamePrompt } from '@/components/ui/name-prompt';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/hooks/use-theme';
import { durationLabel } from '@/lib/episode-list';
import { fromRef, refKey, type EpisodeRef } from '@/lib/playlist';
import { usePlayer } from '@/store/player';
import { usePlaylists } from '@/store/playlists';

/** One playlist, or the Up Next queue (id "up-next"). */
export default function PlaylistScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isQueue = id === 'up-next';
  const playlist = usePlaylists((s) => s.playlists.find((p) => p.id === id));
  const items = usePlaylists((s) => (isQueue ? s.upNext : (s.playlists.find((p) => p.id === id)?.items ?? [])));
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const title = isQueue ? 'Up Next' : (playlist?.name ?? 'Playlist');
  const store = usePlaylists.getState;

  const playFrom = (index: number) => {
    const picked = items[index];
    if (!picked) return;
    const { episode, podcast } = fromRef(picked);
    // Whatever follows becomes the queue, so the playlist carries on after this episode. For
    // Up Next itself the queue is already that order (and playing removes the episode from it).
    if (!isQueue) store().setQueue(items.slice(index + 1));
    usePlayer.getState().play(episode, podcast);
  };

  const remove = (r: EpisodeRef) => (isQueue ? store().removeFromQueue(refKey(r)) : store().removeFromPlaylist(id, refKey(r)));
  const move = (from: number, to: number) => (isQueue ? store().moveInQueue(from, to) : store().moveInPlaylist(id, from, to));

  const menuItems: MenuItem[] = (
    isQueue
      ? [{ label: 'Clear Up Next', icon: 'clear-all' as const, destructive: true, disabled: items.length === 0, onPress: () => store().clearQueue() }]
      : [
          { label: 'Rename', icon: 'edit' as const, onPress: () => setRenaming(true) },
          { label: 'Add all to Up Next', icon: 'queue-music' as const, disabled: items.length === 0, onPress: () => store().playLast(items) },
          {
            label: 'Delete playlist',
            icon: 'delete-outline' as const,
            destructive: true,
            separator: true,
            onPress: () => {
              void confirmAsync('Delete playlist?', `Delete “${title}”? The episodes themselves are not deleted.`, 'Delete').then((ok) => {
                if (!ok) return;
                store().deletePlaylist(id);
                router.back();
              });
            },
          },
        ]
  ).map((i) => ({ ...i, onPress: () => { setMenu(false); i.onPress(); } }));

  if (!isQueue && !playlist) {
    return (
      <ThemedView style={styles.fill}>
        <ScreenHeader title="Playlist" back />
        <View style={styles.empty}>
          <ThemedText themeColor="textSecondary">This playlist no longer exists.</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader
        title={title}
        back
        right={
          <>
            {!isQueue ? (
              <IconButton name="play-arrow" label="Play playlist" color={theme.accent} onPress={() => playFrom(0)} />
            ) : null}
            <IconButton name="more-vert" label="More options" color={theme.accent} onPress={() => setMenu(true)} />
          </>
        }
      />
      {items.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
            {isQueue
              ? 'Nothing queued. Use “Play next” or “Play last” on an episode.'
              : 'No episodes yet. Add some from an episode’s menu, or select episodes on a podcast page.'}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => refKey(r)}
          renderItem={({ item, index }) => (
            <View style={[styles.row, { borderBottomColor: theme.border }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Play ${item.episode.title}`} onPress={() => playFrom(index)} style={styles.body}>
                <Artwork uri={item.episode.artwork ?? item.podcast.artwork} title={item.podcast.title} size={52} radius={8} />
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {item.episode.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {item.podcast.title}
                    {durationLabel(item.episode.durationSec) ? ` · ${durationLabel(item.episode.durationSec)}` : ''}
                  </ThemedText>
                </View>
              </Pressable>
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" accessibilityLabel="Move up" disabled={index === 0} hitSlop={6} onPress={() => move(index, index - 1)} style={{ opacity: index === 0 ? 0.3 : 1 }}>
                  <Icon name="keyboard-arrow-up" size={24} color={theme.textSecondary} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Move down"
                  disabled={index === items.length - 1}
                  hitSlop={6}
                  onPress={() => move(index, index + 1)}
                  style={{ opacity: index === items.length - 1 ? 0.3 : 1 }}>
                  <Icon name="keyboard-arrow-down" size={24} color={theme.textSecondary} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.episode.title}`} hitSlop={6} onPress={() => remove(item)}>
                  <Icon name="close" size={22} color={theme.textSecondary} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
      <MenuSheet visible={menu} items={menuItems} onClose={() => setMenu(false)} />
      <NamePrompt
        visible={renaming}
        title="Rename playlist"
        confirmLabel="Save"
        initialName={title}
        onCancel={() => setRenaming(false)}
        onSubmit={(name) => {
          store().renamePlaylist(id, name);
          setRenaming(false);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
