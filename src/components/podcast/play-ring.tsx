import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';

const SIZE = 46;
const STROKE = 2.5;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

/** Play button with a progress arc around it; becomes a green check once the episode is finished. */
export function PlayRing({
  progress,
  played,
  playing = false,
  onPress,
  label,
}: {
  /** 0..1 */
  progress: number;
  played: boolean;
  /** Show a pause glyph (this episode is playing right now). */
  playing?: boolean;
  onPress: () => void;
  label: string;
}) {
  const theme = useTheme();
  const color = played ? theme.success : theme.accent;
  const arc = Math.min(1, Math.max(0, progress));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={played ? `${label}, played` : label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.6 : 1 }]}>
      <Svg width={SIZE} height={SIZE} style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}>
        {played && !playing ? (
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2} fill={theme.success} />
        ) : (
          <>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={color} strokeOpacity={arc > 0 ? 0.25 : 1} strokeWidth={STROKE} fill="none" />
            {arc > 0 ? (
              <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                stroke={color}
                strokeWidth={STROKE}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${CIRC * arc} ${CIRC}`}
              />
            ) : null}
          </>
        )}
      </Svg>
      <View>
        <Icon name={playing ? 'pause' : played ? 'check' : 'play-arrow'} size={26} color={played && !playing ? '#fff' : color} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
});
