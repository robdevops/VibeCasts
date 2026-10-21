import { Tabs, TabList, TabSlot, TabTrigger, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

import { MiniPlayer } from './player/mini-player';
import { ThemedText } from './themed-text';
import { Icon, type IconName } from './ui/icon';

/**
 * One tab bar for every platform. It's custom (rather than native tabs) so the persistent mini
 * player can sit exactly above it on iOS, Android and web.
 */
export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <BottomBar>
          <TabTrigger name="(podcasts)" href="/" asChild>
            <TabButton icon="grid-view">Podcasts</TabButton>
          </TabTrigger>
          <TabTrigger name="(playlists)" href="/playlists" asChild>
            <TabButton icon="format-list-bulleted">Playlists</TabButton>
          </TabTrigger>
          <TabTrigger name="(discovery)" href="/discovery" asChild>
            <TabButton icon="search">Discovery</TabButton>
          </TabTrigger>
          <TabTrigger name="(profile)" href="/profile" asChild>
            <TabButton icon="person">Profile</TabButton>
          </TabTrigger>
        </BottomBar>
      </TabList>
    </Tabs>
  );
}

function BottomBar({ children, ...props }: TabListProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View {...props} style={[styles.bar, { backgroundColor: theme.background, borderTopColor: theme.border, paddingBottom: insets.bottom }]}>
      <MiniPlayer />
      <View style={styles.row}>{children}</View>
    </View>
  );
}

function TabButton({ children, icon, isFocused, ...props }: TabTriggerSlotProps & { icon: IconName }) {
  const theme = useTheme();
  const color = isFocused ? theme.accent : theme.textSecondary;
  return (
    <Pressable {...props} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }} style={styles.button}>
      <Icon name={icon} size={26} color={color} />
      <ThemedText type="smallBold" style={[styles.label, { color }]}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { flex: 1 },
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  row: { flexDirection: 'row' },
  button: { flex: 1, alignItems: 'center', gap: 2, paddingTop: 14, paddingBottom: 6 },
  label: { fontSize: 12, lineHeight: 16 },
});
