import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';

import { Colors } from '@/constants/theme';

import { ThemedText } from './themed-text';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <View style={StyleSheet.flatten([styles.bar, { backgroundColor: colors.background, borderTopColor: colors.border }])}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>Podcasts</TabButton>
          </TabTrigger>
          <TabTrigger name="playlists" href="/playlists" asChild>
            <TabButton>Playlists</TabButton>
          </TabTrigger>
          <TabTrigger name="discovery" href="/discovery" asChild>
            <TabButton>Discovery</TabButton>
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    // @ts-expect-error expo-router/ui TabTriggerSlotProps ref typing mismatch
    <Pressable {...props} style={styles.button}>
      <ThemedText type="smallBold" themeColor={isFocused ? 'accent' : 'textSecondary'}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  button: { flex: 1, alignItems: 'center', paddingVertical: 14 },
});
