import { Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LibrarySection } from '@/components/settings/library-section';
import { NavRow } from '@/components/settings/rows';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/hooks/use-theme';
import { playerLog } from '@/player/event-log';

async function sharePlaybackLog() {
  const text = playerLog.text() || 'No playback events recorded yet.';
  if (Platform.OS === 'web') {
    await navigator.clipboard?.writeText(text).catch(() => {});
    return;
  }
  await Share.share({ message: text }).catch(() => {});
}

export default function SettingsScreen() {
  const theme = useTheme();
  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader title="Settings" back />
      <ScrollView>
        <NavRow label="Playback" hint="Skip lengths, resume, mobile data, sleep timer." href="/settings-playback" />
        <NavRow label="Downloads" hint="Auto archive, auto delete and automatic downloads." href="/settings-downloads" />
        <NavRow label="Bluetooth" hint="What the headset and lock screen buttons do." href="/settings-bluetooth" />
        <LibrarySection />
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
          TROUBLESHOOTING
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share playback log"
          onPress={() => void sharePlaybackLog()}
          style={[styles.row, { borderBottomColor: theme.border }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText>Share playback log</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              A short record of what the player did, to help find out why playback stopped. It holds no listening history.
            </ThemedText>
          </View>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  section: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6, letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
