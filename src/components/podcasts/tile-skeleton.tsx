import { useEffect } from 'react';
import { Dimensions, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { metricsFor, slotRect } from '@/lib/grid';

/** Blank, gently pulsing tiles shown while the saved library loads (instead of a misleading "no podcasts"). */
export function TileSkeleton({ count = 12 }: { count?: number }) {
  const theme = useTheme();
  // The window size can still read 0 on the very first frame, so fall back to the screen's.
  const { width: windowWidth } = useWindowDimensions();
  const width = windowWidth || Dimensions.get('window').width || 390;
  const m = metricsFor(width);
  const pulse = useSharedValue(0.6);

  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [pulse]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  const tiles = [];
  for (let i = 0; i < count; i++) {
    const r = slotRect(i, m);
    tiles.push(<View key={i} style={[styles.tile, { left: r.left, top: r.top, width: r.size, height: r.size, backgroundColor: theme.backgroundSelected }]} />);
  }

  return (
    <Animated.View accessibilityLabel="Loading your podcasts" accessibilityRole="progressbar" pointerEvents="none" style={[styles.wrap, style]}>
      {tiles}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 600 },
  tile: { position: 'absolute', borderRadius: 8 },
});
