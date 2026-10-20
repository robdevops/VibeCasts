import { ScrollView, StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { DownloadsSection } from '@/components/settings/downloads-section';
import { ScreenHeader } from '@/components/ui/screen-header';

export default function DownloadsSettingsScreen() {
  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader title="Downloads" back />
      <ScrollView>
        <DownloadsSection />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
