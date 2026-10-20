import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { SLEEP_MINUTES, sleepLabel } from '@/lib/player-math';
import type { Sleep } from '@/store/player';

type Props = {
  visible: boolean;
  sleep: Sleep;
  now: number;
  onChoose: (opt: { minutes: number } | 'episode' | null) => void;
  onClose: () => void;
};

const ACCENT = '#B79CFF';

export function SleepSheet({ visible, sleep, now, onChoose, onClose }: Props) {
  const row = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        onPress();
        onClose();
      }}
      style={styles.row}>
      <ThemedText style={{ color: selected ? ACCENT : '#fff', flex: 1 }}>{label}</ThemedText>
      {selected ? <Icon name="check" size={22} color={ACCENT} /> : null}
    </Pressable>
  );
  const active = sleep?.kind === 'timer' ? sleep : null;
  return (
    <BottomSheet visible={visible} title="Sleep timer" onClose={onClose} dark>
      {active ? (
        <ThemedText type="small" style={{ color: 'rgba(255,255,255,0.7)' }}>
          Stopping in {sleepLabel(active.endsAt, now)}
        </ThemedText>
      ) : null}
      <View>
        {SLEEP_MINUTES.map((m) => row(`${m} minutes`, active?.minutes === m, () => onChoose({ minutes: m })))}
        {row('End of episode', sleep?.kind === 'episode', () => onChoose('episode'))}
        {row('Off', sleep === null, () => onChoose(null))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
});
