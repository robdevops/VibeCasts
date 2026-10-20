import { ScrollView, StyleSheet } from 'react-native';

import { ELASTIC_SCROLL } from '@/constants/scroll';
import { ThemedView } from '@/components/themed-view';
import { DownloadsSection } from '@/components/settings/downloads-section';
import { ScreenHeader } from '@/components/ui/screen-header';

export default function DownloadsSettingsScreen() {
  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader title="Downloads" back />
      <ScrollView {...ELASTIC_SCROLL}>
        <DownloadsSection />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
