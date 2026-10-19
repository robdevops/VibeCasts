import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon, type IconName } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/hooks/use-theme';
import { useBookmarks } from '@/store/bookmarks';
import { useLibrary } from '@/store/library';

type Route = '/downloads' | '/starred' | '/bookmarks' | '/history' | '/settings';

export default function ProfileScreen() {
  const theme = useTheme();
  const starred = useLibrary((s) => Object.values(s.episodes).filter((e) => e.starred).length);
  const downloaded = useLibrary((s) => Object.values(s.episodes).filter((e) => e.downloadedUri).length);
  const bookmarks = useBookmarks((s) => s.items.length);
  const subscriptions = useLibrary((s) => Object.keys(s.subscriptions).length);

  const row = (icon: IconName, label: string, route: Route, count?: number) => (
    <Pressable
      key={route}
      accessibilityRole="button"
      onPress={() => router.push(route)}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.border, backgroundColor: pressed ? theme.backgroundElement : 'transparent' }]}>
      <Icon name={icon} size={26} color={theme.textSecondary} />
      <ThemedText style={styles.label}>{label}</ThemedText>
      {count !== undefined ? (
        <ThemedText type="small" themeColor="textSecondary">
          {count}
        </ThemedText>
      ) : null}
      <Icon name="chevron-right" size={24} color={theme.textSecondary} />
    </Pressable>
  );

  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader title="Profile" large />
      <ScrollView>
        <View style={styles.summary}>
          <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
            <Icon name="headphones" size={36} color={theme.accent} />
          </View>
          <ThemedText type="subtitle">Your library</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {subscriptions} podcast{subscriptions === 1 ? '' : 's'}
          </ThemedText>
        </View>
        {row('file-download', 'Downloads', '/downloads', downloaded)}
        {row('star-border', 'Starred', '/starred', starred)}
        {row('bookmark-border', 'Bookmarks', '/bookmarks', bookmarks)}
        {row('history', 'Listening history', '/history')}
        {row('settings', 'Settings', '/settings')}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  summary: { alignItems: 'center', gap: 4, paddingVertical: 24 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { flex: 1, fontSize: 17 },
});
