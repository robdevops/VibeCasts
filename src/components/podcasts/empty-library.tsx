import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { topPodcasts } from '@/api/itunes';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useLibrary } from '@/store/library';

export function EmptyLibrary({ message, showStarter = true }: { message: string; showStarter?: boolean }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stop-gap until Discovery (phase 3): subscribe to the current top shows so the grid has content.
  const addStarter = async () => {
    setBusy(true);
    setError(null);
    try {
      const list = await topPodcasts('us', 9);
      if (!list.length) setError('No podcasts came back. Check your connection and try again.');
      for (const p of list) useLibrary.getState().subscribe(p);
    } catch {
      setError('Could not reach the podcast directory. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <ThemedText type="subtitle" style={styles.center}>
        {message}
      </ThemedText>
      {showStarter ? (
        <>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            Discovery is coming next. For now you can start with today&apos;s top podcasts.
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={addStarter}
            style={[styles.button, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <ThemedText type="smallBold" style={{ color: '#fff' }}>Add top podcasts</ThemedText>}
          </Pressable>
          {error ? <ThemedText type="small" themeColor="accent" style={styles.center}>{error}</ThemedText> : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  center: { textAlign: 'center' },
  button: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24, minWidth: 180, alignItems: 'center' },
});
