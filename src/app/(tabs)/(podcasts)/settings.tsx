import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/store/settings';

const STEPS = [5, 10, 15, 20, 30, 45, 60, 90];

export default function SettingsScreen() {
  const theme = useTheme();
  const s = useSettings();

  const toggle = (label: string, hint: string, value: boolean, key: 'deleteOnFinish' | 'downloadBeforePlay' | 'wifiOnly') => (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText>{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      </View>
      <Switch value={value} onValueChange={(v) => s.set({ [key]: v })} trackColor={{ true: theme.accent }} accessibilityLabel={label} />
    </View>
  );

  const stepper = (label: string, value: number, key: 'skipBackSec' | 'skipForwardSec') => {
    const i = STEPS.indexOf(value);
    const move = (d: number) => s.set({ [key]: STEPS[Math.min(STEPS.length - 1, Math.max(0, (i < 0 ? 2 : i) + d))] });
    return (
      <View style={[styles.row, { borderBottomColor: theme.border }]}>
        <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} onPress={() => move(-1)} style={[styles.step, { borderColor: theme.border }]}>
          <Icon name="remove" size={20} color={theme.text} />
        </Pressable>
        <ThemedText type="smallBold" style={styles.value}>
          {value}s
        </ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} onPress={() => move(1)} style={[styles.step, { borderColor: theme.border }]}>
          <Icon name="add" size={20} color={theme.text} />
        </Pressable>
      </View>
    );
  };

  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader title="Settings" back />
      <ScrollView>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
          PLAYBACK
        </ThemedText>
        {stepper('Skip back', s.skipBackSec, 'skipBackSec')}
        {stepper('Skip forward', s.skipForwardSec, 'skipForwardSec')}
        {toggle('Delete episode when finished', 'Removes the downloaded file once you finish listening.', s.deleteOnFinish, 'deleteOnFinish')}
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          The lock-screen and headset buttons use a fixed 10 second skip set by the operating system.
        </ThemedText>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
          DOWNLOADS & DATA
        </ThemedText>
        {toggle('Download before playing', 'Download the whole episode before it starts.', s.downloadBeforePlay, 'downloadBeforePlay')}
        {toggle('Stream on Wi-Fi only', 'Don’t use mobile data to stream or download.', s.wifiOnly, 'wifiOnly')}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  section: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6, letterSpacing: 0.8 },
  note: { paddingHorizontal: 16, paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  step: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 48, textAlign: 'center' },
});
