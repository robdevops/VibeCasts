import { Pressable, StyleSheet, View } from 'react-native';

import type { Podcast } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Artwork } from '@/components/ui/artwork';
import { useTheme } from '@/hooks/use-theme';

import { Badge } from './badge';

/** List-layout row used for both podcasts and folders. */
export function PodcastRow({
  title,
  subtitle,
  art,
  mosaic,
  unplayed,
  onPress,
}: {
  title: string;
  subtitle?: string;
  art?: Podcast;
  mosaic?: Podcast[];
  unplayed: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundElement : 'transparent' }]}>
      <View>
        {art ? (
          <Artwork uri={art.artwork} title={art.title} size={64} radius={8} />
        ) : (
          <View style={[styles.mosaic, { backgroundColor: theme.backgroundElement }]}>
            {(mosaic ?? []).slice(0, 4).map((p) => (
              <Artwork key={p.id} uri={p.artwork} title={p.title} size={29} radius={4} />
            ))}
          </View>
        )}
        <Badge count={unplayed} size="sm" />
      </View>
      <View style={styles.text}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 8 },
  text: { flex: 1, gap: 2 },
  mosaic: { width: 64, height: 64, borderRadius: 8, padding: 2, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
});
