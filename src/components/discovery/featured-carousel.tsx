import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import type { Podcast } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Artwork } from '@/components/ui/artwork';
import { useTheme } from '@/hooks/use-theme';

import { SubscribeButton } from './result-rows';

/** Paged highlights from the top chart, with page dots. */
export function FeaturedCarousel({ items, onOpen }: { items: Podcast[]; onOpen: (p: Podcast) => void }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  if (!items.length) return null;
  return (
    <View>
      <FlatList
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.id}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width, backgroundColor: theme.accentSoft }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Featured: ${item.title}`} onPress={() => onOpen(item)} style={styles.body}>
              <Artwork uri={item.artwork} title={item.title} size={132} radius={12} />
              <View style={styles.text}>
                <ThemedText type="smallBold" themeColor="accent">
                  FEATURED
                </ThemedText>
                <ThemedText type="subtitle" numberOfLines={3} style={styles.title}>
                  {item.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {item.author}
                </ThemedText>
              </View>
            </Pressable>
            <SubscribeButton podcast={item} />
          </View>
        )}
      />
      <View style={styles.dots} accessibilityElementsHidden>
        {items.map((p, i) => (
          <View key={p.id} style={[styles.dot, { backgroundColor: i === page ? theme.accent : theme.border }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 },
  text: { flex: 1, gap: 4 },
  title: { fontSize: 22, lineHeight: 28 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
