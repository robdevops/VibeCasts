import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <View style={styles.container}>
      <Text style={styles.count} testID="count">
        {count}
      </Text>
      <Pressable accessibilityRole="button" onPress={() => setCount((c) => c + 1)} style={styles.button}>
        <Text style={styles.label}>Increment</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 16, padding: 24 },
  count: { fontSize: 64, fontWeight: '700' },
  button: { backgroundColor: '#2563eb', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  label: { color: 'white', fontSize: 18, fontWeight: '600' },
});
