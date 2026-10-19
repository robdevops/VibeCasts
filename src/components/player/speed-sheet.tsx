import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { RATE_PRESETS, formatRate, stepRate } from '@/lib/player-math';

type Props = { visible: boolean; rate: number; onChange: (rate: number) => void; onClose: () => void };

const ACCENT = '#FF5A52';

export function SpeedSheet({ visible, rate, onChange, onClose }: Props) {
  return (
    <BottomSheet visible={visible} title="Playback speed" onClose={onClose} dark>
      <View style={styles.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel="Slower" onPress={() => onChange(stepRate(rate, -1))} style={styles.step}>
          <Icon name="remove" size={26} color="#fff" />
        </Pressable>
        <ThemedText type="title" style={styles.value} accessibilityLiveRegion="polite">
          {formatRate(rate)}
        </ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel="Faster" onPress={() => onChange(stepRate(rate, 1))} style={styles.step}>
          <Icon name="add" size={26} color="#fff" />
        </Pressable>
      </View>
      <View style={styles.presets}>
        {RATE_PRESETS.map((r) => (
          <Pressable
            key={r}
            accessibilityRole="button"
            accessibilityState={{ selected: r === rate }}
            onPress={() => onChange(r)}
            style={[styles.chip, { borderColor: r === rate ? ACCENT : 'rgba(255,255,255,0.25)', backgroundColor: r === rate ? 'rgba(255,90,82,0.18)' : 'transparent' }]}>
            <ThemedText type="smallBold" style={{ color: r === rate ? ACCENT : '#fff' }}>
              {formatRate(r)}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  step: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  value: { color: '#fff', minWidth: 120, textAlign: 'center' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  chip: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 },
});
