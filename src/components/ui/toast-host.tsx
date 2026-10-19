import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/store/toast';

/** One-line message pill near the bottom of the screen. Mount once at the root. */
export function ToastHost() {
  const message = useToast((s) => s.message);
  const insets = useSafeAreaInsets();
  if (!message) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 96 }]}>
      <View style={styles.pill} accessibilityLiveRegion="polite">
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  pill: { backgroundColor: 'rgba(30,30,32,0.94)', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12, maxWidth: '86%' },
  text: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
