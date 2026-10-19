import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/** Circular-arrow skip icon with the number of seconds in the middle. */
export function SkipIcon({ direction, seconds, size = 32, color }: { direction: 'back' | 'forward'; seconds: number; size?: number; color: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={[StyleSheet.absoluteFill, direction === 'forward' ? { transform: [{ scaleX: -1 }] } : null]}>
        {/* Material "replay" glyph, mirrored for forward. */}
        <Path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" fill={color} />
      </Svg>
      <Text
        style={{ color, fontSize: size * (seconds >= 100 ? 0.24 : 0.29), fontWeight: '800', marginTop: size * 0.16 }}
        accessibilityElementsHidden
        importantForAccessibility="no">
        {seconds}
      </Text>
    </View>
  );
}
