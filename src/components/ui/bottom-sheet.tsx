import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type Props = { visible: boolean; title: string; onClose: () => void; children: ReactNode; dark?: boolean };

/** Simple slide-up sheet. `dark` matches the episode screen's maroon theme. */
export function BottomSheet({ visible, title, onClose, children, dark }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={`Close ${title}`} />
      <View style={[styles.sheet, { backgroundColor: dark ? '#2B1111' : theme.background, paddingBottom: insets.bottom + 20 }]}>
        <ThemedText type="subtitle" style={[styles.title, dark ? { color: '#fff' } : null]}>
          {title}
        </ThemedText>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14 },
  title: { fontSize: 22, lineHeight: 28 },
});
