import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';

const SIZE = 46;
const STROKE = 2.5;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

/**
 * Play button with a ring that starts full and shrinks as you listen (time remaining). Once the
 * episode is finished it is just a small greyed-out tick (still tappable to play it again).
 */
export function PlayRing({
  remaining,
  played,
  playing = false,
  onPress,
  label,
}: {
  /** 0..1 fraction of the episode still to play. */
  remaining: number;
  played: boolean;
  /** Show a pause glyph (this episode is playing right now). */
  playing?: boolean;
  onPress: () => void;
  label: string;
}) {
  const theme = useTheme();
  const color = theme.accent;
  const done = played && !playing;
  const arc = Math.min(1, Math.max(0, remaining));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={played ? `${label}, played` : label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.6 : 1 }]}>
      <Svg width={SIZE} height={SIZE} style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}>
        {done ? null : (
          <>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={color} strokeOpacity={0.25} strokeWidth={STROKE} fill="none" />
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
        {done ? <Icon name="check" size={18} color={theme.textSecondary} /> : <Icon name={playing ? 'pause' : 'play-arrow'} size={26} color={color} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
});
