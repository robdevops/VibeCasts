import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

import { IconButton } from './icon-button';

type Props = {
  title: string;
  large?: boolean;
  back?: boolean;
  right?: ReactNode;
  onBack?: () => void;
  /** Replaces the title (e.g. a search field). */
  center?: ReactNode;
  /** Colour for the title and the back button instead of the accent (the background stays as it is). */
  ink?: string;
};

export function ScreenHeader({ title, large, back, right, onBack, center, ink: inkColor }: Props) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const ink = inkColor ?? theme.accent;
  return (
    <View style={[styles.bar, { paddingTop: insets.top, backgroundColor: theme.background }]}>
      <View style={styles.row}>
        {back ? (
          <IconButton
            name="arrow-back"
            label="Back"
            color={ink}
            onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
          />
        ) : null}
        {center ? (
          <View style={styles.title}>{center}</View>
        ) : (
          <ThemedText
            type={large ? 'title' : 'subtitle'}
            numberOfLines={1}
            accessibilityRole="header"
            style={[styles.title, large ? styles.large : null, inkColor ? { color: ink } : back ? { color: theme.accent } : null]}>
            {title}
          </ThemedText>
        )}
        <View style={styles.right}>{right}</View>
      </View>
    </View>
  );
}

export const HEADER_HEIGHT = 56;

const styles = StyleSheet.create({
  bar: {},
  row: { height: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 4 },
  title: { flex: 1, fontSize: 20, lineHeight: 26 },
  large: { fontSize: 32, lineHeight: 40, paddingLeft: 4 },
  right: { flexDirection: 'row', alignItems: 'center' },
});
