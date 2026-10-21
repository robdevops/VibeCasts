import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { GlowPressable } from './glow-pressable';

// Reanimated's native side doesn't exist under Jest: a plain stand-in (animation values are just boxes).
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const value = (v: number) => {
    let current = v;
    return { get: () => current, set: (n: number) => void (current = n) };
  };
  return {
    __esModule: true,
    default: { View },
    useSharedValue: value,
    useAnimatedStyle: (fn: () => object) => fn(),
    withTiming: (n: number) => n,
    withSpring: (n: number) => n,
    withSequence: (...n: number[]) => n[n.length - 1],
  };
});

describe('GlowPressable', () => {
  it('passes a tap on, and does nothing when disabled', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(
      <GlowPressable accessibilityRole="button" accessibilityLabel="Go" onPress={onPress} glowColor="#fff" glowSize={40} tiltDeg={30}>
        <Text>x</Text>
      </GlowPressable>,
    );
    await fireEvent.press(screen.getByLabelText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await rerender(
      <GlowPressable accessibilityRole="button" accessibilityLabel="Go" onPress={onPress} disabled glowColor="#fff" glowSize={40}>
        <Text>x</Text>
      </GlowPressable>,
    );
    await fireEvent.press(screen.getByLabelText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
