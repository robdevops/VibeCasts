import { StyleSheet, Text, View } from 'react-native';

import type { Podcast } from '@/api/types';
import { Artwork } from '@/components/ui/artwork';
import type { Folder } from '@/store/library';

import { Badge } from './badge';

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.18,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 3 },
  elevation: 4,
} as const;

export function PodcastTile({ podcast, unplayed, size }: { podcast: Podcast; unplayed: number; size: number }) {
  return (
    <>
      <Artwork uri={podcast.artwork} title={podcast.title} size={size} radius={8} style={shadow} accessibilityLabel={podcast.title} accessibilityRole="button" />
      <Badge count={unplayed} />
    </>
  );
}

/** Folder tile: coloured card, 2x2 mosaic of the first four members, name along the bottom. */
export function FolderTile({
  folder,
  members,
  unplayed,
  size,
}: {
  folder: Folder;
  members: Podcast[];
  unplayed: number;
  size: number;
}) {
  // Leave ~22px at the bottom for the name.
  const gap = 5;
  const cell = Math.floor((size - 32 - gap) / 2);
  const first = members.slice(0, 4);
  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={`Folder ${folder.name}, ${members.length} podcasts`}
      style={[styles.folder, shadow, { width: size, height: size, backgroundColor: folder.color }]}>
      <View style={[styles.mosaic, { width: cell * 2 + gap, gap }]}>
        {[0, 1, 2, 3].map((i) => {
          const p = first[i];
          return p ? (
            <Artwork key={p.id} uri={p.artwork} title={p.title} size={cell} radius={3} />
          ) : (
            <View key={i} style={[styles.empty, { width: cell, height: cell }]} />
          );
        })}
      </View>
      <Text numberOfLines={1} style={styles.name}>
        {folder.name}
      </Text>
      <Badge count={unplayed} />
    </View>
  );
}

const styles = StyleSheet.create({
  folder: { borderRadius: 8, padding: 10, paddingBottom: 4 },
  mosaic: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center' },
  empty: { borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
  name: { color: '#fff', fontWeight: '700', fontSize: 14, textAlign: 'center', marginTop: 'auto', marginBottom: 2, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 3 },
});
