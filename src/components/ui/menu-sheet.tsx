import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
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

type Props = { visible: boolean; items: MenuItem[]; onClose: () => void; title?: string; anchor?: 'top' | 'bottom'; dark?: boolean };

/** Popover menu anchored to the top-right (default) or bottom-right of the screen. */
export function MenuSheet({ visible, items, onClose, title, anchor = 'top', dark }: Props) {
  const theme = useTheme();
  // Scrolling is only switched on when the rows really don't fit: a menu that fits must not wobble or scroll at all.
  const [sizes, setSizes] = useState({ content: 0, view: 0 });
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // Keep clear of the screen's bottom edge (and the gesture bar) so the last item is never cramped.
  const topOffset = insets.top + 52;
  const maxHeight = height - topOffset - insets.bottom - BOTTOM_MARGIN;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <View
        style={[
          styles.card,
          anchor === 'top' ? { top: topOffset, maxHeight } : { bottom: insets.bottom + 100, maxHeight: height - insets.top - insets.bottom - 140 },
          { backgroundColor: dark ? '#1E1433' : theme.background, borderColor: dark ? 'rgba(255,255,255,0.15)' : theme.border },
        ]}>
        <ScrollView
          bounces={false}
          overScrollMode="never"
          scrollEnabled={sizes.content > sizes.view + 1}
          onLayout={(e) => setSizes((z) => ({ ...z, view: e.nativeEvent.layout.height }))}
          onContentSizeChange={(_w, h) => setSizes((z) => ({ ...z, content: h }))}
          showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.pad}>
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
                  <Icon name={item.icon} size={22} color={item.destructive ? theme.danger : theme.textSecondary} />
                ) : null}
              </View>
              <ThemedText style={{ flex: 1, color: item.destructive ? theme.danger : dark ? '#fff' : theme.text }}>{item.label}</ThemedText>
              {item.checked ? <Icon name="check" size={20} color={theme.accent} /> : null}
            </Pressable>
          </View>
        ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Space kept between a top-anchored menu and the bottom of the screen. */
const BOTTOM_MARGIN = 8;

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    right: 12,
    minWidth: 240,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  pad: { paddingTop: 6, paddingBottom: 14 },
  // Padding lives inside the scroller so the card's height is exactly its content's.
  scroll: { flexGrow: 0 },
  title: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  iconSlot: { width: 22 },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
