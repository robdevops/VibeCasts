import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ELASTIC_SCROLL } from '@/constants/scroll';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { NamePrompt } from '@/components/ui/name-prompt';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/hooks/use-theme';
import { usePlaylists } from '@/store/playlists';

export default function PlaylistsScreen() {
  const theme = useTheme();
  const upNext = usePlaylists((s) => s.upNext.length);
  const playlists = usePlaylists((s) => s.playlists);
  const [naming, setNaming] = useState(false);

  const rows = [
    { id: 'up-next', name: 'Up Next', count: upNext, icon: 'queue-music' as IconName, hint: 'Plays after the current episode' },
    ...playlists.map((p) => ({ id: p.id, name: p.name, count: p.items.length, icon: 'playlist-play' as IconName, hint: '' })),
  ];

  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader
        title="Playlists"
        large
        right={<IconButton name="playlist-add" label="New playlist" color={theme.accent} onPress={() => setNaming(true)} />}
      />
      <FlatList
        {...ELASTIC_SCROLL}
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.count} episodes`}
            onPress={() => router.push({ pathname: '/(tabs)/(playlists)/playlist/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.row, { borderBottomColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
            <View style={[styles.icon, { backgroundColor: theme.accentSoft }]}>
              <Icon name={item.icon} size={26} color={theme.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText type="smallBold">{item.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.count} episode{item.count === 1 ? '' : 's'}
                {item.hint ? ` · ${item.hint}` : ''}
              </ThemedText>
            </View>
            <Icon name="chevron-right" size={22} color={theme.textSecondary} />
          </Pressable>
        )}
        ListFooterComponent={
          playlists.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Make a playlist with the + button, then add episodes from an episode&apos;s menu or by selecting episodes on a podcast page.
            </ThemedText>
          ) : null
        }
      />
      <NamePrompt
        visible={naming}
        title="New playlist"
        confirmLabel="Create"
        onCancel={() => setNaming(false)}
        onSubmit={(name) => {
          const id = usePlaylists.getState().createPlaylist(name);
          setNaming(false);
          router.push({ pathname: '/(tabs)/(playlists)/playlist/[id]', params: { id } });
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  hint: { paddingHorizontal: 16, paddingTop: 16 },
});
