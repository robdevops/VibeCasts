import { Modal, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import type { Subscription } from '@/store/library';

type Overrides = Subscription['overrides'];

type Props = {
  visible: boolean;
  title: string;
  overrides: Overrides;
  onChange: (patch: Overrides) => void;
  onClose: () => void;
};

/** Per-podcast settings that override the app defaults. */
export function SettingsSheet({ visible, title, overrides, onChange, onClose }: Props) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close settings" />
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <ThemedText type="subtitle" numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          These override the app-wide defaults for this podcast.
        </ThemedText>

        <ToggleRow label="Notify me about new episodes" value={!!overrides.notifications} onChange={(v) => onChange({ notifications: v })} />
        <ToggleRow label="Auto download new episodes" value={!!overrides.autoDownload} onChange={(v) => onChange({ autoDownload: v })} />
        <StepperRow label="Skip first" value={overrides.skipFirstSec ?? 0} onChange={(v) => onChange({ skipFirstSec: v })} />
        <StepperRow label="Skip last" value={overrides.skipLastSec ?? 0} onChange={(v) => onChange({ skipLastSec: v })} />

        <Pressable accessibilityRole="button" onPress={onClose} style={[styles.done, { backgroundColor: theme.accent }]}>
          <ThemedText type="smallBold" style={{ color: '#fff' }}>
            Done
          </ThemedText>
        </Pressable>
      </View>
    </Modal>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.accent }} accessibilityLabel={label} />
    </View>
  );
}

const STEP = 5;
const MAX = 120;

function StepperRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const theme = useTheme();
  const btn = (name: 'remove' | 'add', next: number, hint: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${hint} ${label.toLowerCase()}`}
      onPress={() => onChange(Math.min(MAX, Math.max(0, next)))}
      style={[styles.step, { borderColor: theme.border }]}>
      <Icon name={name} size={20} color={theme.text} />
    </Pressable>
  );
  return (
    <View style={styles.row}>
      <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
      {btn('remove', value - STEP, 'Decrease')}
      <ThemedText type="smallBold" style={styles.value}>
        {value === 0 ? 'Off' : `${value}s`}
      </ThemedText>
      {btn('add', value + STEP, 'Increase')}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  step: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 44, textAlign: 'center' },
  done: { borderRadius: 24, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
});
