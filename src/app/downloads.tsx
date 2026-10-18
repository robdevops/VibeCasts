import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ScreenHeader } from '@/components/ui/screen-header';

/** Placeholder: filled in once playback (phase 4) and downloads (phase 5) exist. */
export default function DownloadsScreen() {
  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader title="Downloads" back />
      <View style={styles.empty}>
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
          Episodes you download will show up here.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
