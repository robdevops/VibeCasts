import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Artwork } from '@/components/ui/artwork';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useLibrary } from '@/store/library';

/** Placeholder until the full podcast page lands in phase 3. */
export default function PodcastScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const podcast = useLibrary((s) => s.subscriptions[id]?.podcast);
  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader title={podcast?.title ?? 'Podcast'} back />
      {podcast ? (
        <View style={styles.body}>
          <Artwork uri={podcast.artwork} title={podcast.title} size={220} radius={16} />
          <ThemedText type="subtitle">{podcast.title}</ThemedText>
          <ThemedText themeColor="textSecondary">{podcast.author}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Episode list coming in the next phase.
          </ThemedText>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { alignItems: 'center', padding: 24, gap: 10 },
});
