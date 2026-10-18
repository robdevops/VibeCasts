import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** Unplayed-count bubble that overlaps a tile's top-right corner. */
export function Badge({ count, size = 'md' }: { count: number; size?: 'sm' | 'md' }) {
  const theme = useTheme();
  if (count <= 0) return null;
  const h = size === 'md' ? 28 : 22;
  return (
    <View
      accessibilityLabel={`${count} unplayed`}
      style={[styles.badge, { minWidth: h, height: h, borderRadius: h / 2, backgroundColor: theme.badge, borderColor: theme.background }]}>
      <Text style={[styles.text, { fontSize: size === 'md' ? 15 : 12 }]}>{count > 99 ? '99' : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    zIndex: 2,
  },
  text: { color: '#fff', fontWeight: '700' },
});
