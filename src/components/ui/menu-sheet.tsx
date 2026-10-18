import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

import { Icon, type IconName } from './icon';

export type MenuItem = {
  label: string;
  icon?: IconName;
  onPress: () => void;
  checked?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  /** Draws a divider above this item. */
  separator?: boolean;
};

type Props = { visible: boolean; items: MenuItem[]; onClose: () => void; title?: string };

/** Popover menu anchored under the top-right of the screen. */
export function MenuSheet({ visible, items, onClose, title }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <View
        style={[
          styles.card,
          { top: insets.top + 52, backgroundColor: theme.background, borderColor: theme.border },
        ]}>
        {title ? (
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
            {title}
          </ThemedText>
        ) : null}
        {items.map((item) => (
          <View key={item.label}>
            {item.separator ? <View style={[styles.sep, { backgroundColor: theme.border }]} /> : null}
            <Pressable
              accessibilityRole="menuitem"
              accessibilityState={{ disabled: item.disabled, checked: item.checked }}
              disabled={item.disabled}
              onPress={item.onPress}
              style={({ pressed }) => [
                styles.item,
                { backgroundColor: pressed ? theme.backgroundElement : 'transparent', opacity: item.disabled ? 0.4 : 1 },
              ]}>
              <View style={styles.iconSlot}>
                {item.icon ? (
                  <Icon name={item.icon} size={22} color={item.destructive ? theme.accent : theme.textSecondary} />
                ) : null}
              </View>
              <ThemedText style={{ flex: 1, color: item.destructive ? theme.accent : theme.text }}>{item.label}</ThemedText>
              {item.checked ? <Icon name="check" size={20} color={theme.accent} /> : null}
            </Pressable>
          </View>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    right: 12,
    minWidth: 240,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  title: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  iconSlot: { width: 22 },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
