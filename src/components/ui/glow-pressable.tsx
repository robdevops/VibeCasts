import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Colour of the glow that flashes around the control when it is tapped. */
  glowColor: string;
  /** Diameter of the glow (a little bigger than the control). */
  glowSize: number;
  /** How small the control gets while it is held down (1 = no change). */
  pressedScale?: number;
  /** The control tilts this many degrees on a tap and settles back (for the skip arrows). */
  tiltDeg?: number;
};

/**
 * A control that responds to a tap: it shrinks while held and springs back, and a soft circular glow flashes around it
 * (and optionally tilts). Used for the player's big controls and the mini player's buttons.
 */
export function GlowPressable({ children, style, glowColor, glowSize, pressedScale = 0.9, tiltDeg = 0, onPress, onPressIn, onPressOut, ...rest }: Props) {
  const held = useSharedValue(0);
  const glow = useSharedValue(0);
  const tilt = useSharedValue(0);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - held.get() * (1 - pressedScale) }, { rotate: `${tilt.get() * tiltDeg}deg` }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.get() * 0.7,
    transform: [{ scale: 0.7 + glow.get() * 0.45 }],
  }));

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        held.set(withTiming(1, { duration: 80 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        held.set(withSpring(0, { damping: 9, stiffness: 260 }));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        glow.set(0);
        glow.set(withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 460 })));
        if (tiltDeg) {
          tilt.set(0);
          tilt.set(withSequence(withTiming(1, { duration: 110 }), withSpring(0, { damping: 6, stiffness: 220 })));
        }
        onPress?.(e);
      }}
      style={style}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          { width: glowSize, height: glowSize, borderRadius: glowSize / 2, marginLeft: -glowSize / 2, marginTop: -glowSize / 2, backgroundColor: glowColor, shadowColor: glowColor },
          glowStyle,
        ]}
      />
      <Animated.View style={[styles.body, bodyStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Centred behind the control; the owner's box (the Pressable) is the control's own size.
  glow: { position: 'absolute', left: '50%', top: '50%', shadowOpacity: 0.9, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  body: { alignItems: 'center', justifyContent: 'center' },
});
