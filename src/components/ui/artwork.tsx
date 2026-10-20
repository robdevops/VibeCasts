import { Image } from 'expo-image';
import { useMemo } from 'react';
import { PixelRatio, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useThumb } from '@/artwork/thumbs';
import { artworkLow, artworkSized } from '@/lib/artwork';
import { markShown, wasShown } from '@/lib/shown-images';

const PALETTE = ['#E8A33D', '#5B8DEF', '#4CBF8B', '#C468D6', '#EF6C6C', '#4DB6C9', '#8A8D93'];

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

type Props = { uri?: string; title: string; size?: number; radius?: number; style?: StyleProp<ViewStyle>; /** Use the smallest version (a tile that is off screen). */ low?: boolean };

/** Square podcast artwork with a coloured initial as the fallback. */
export function Artwork({ uri, title, size, radius = 10, style, low = false }: Props) {
  // Tiles fill their column (no fixed size): ~110 pt on a phone.
  // The smallest version: a URL edit for iTunes art, a thumbnail made on the phone for other hosts (until it exists, none).
  const thumb = useThumb(uri);
  const lowSource = uri ? (thumb ?? (artworkLow(uri) !== uri ? artworkLow(uri) : undefined)) : undefined;
  const source = uri ? (low && lowSource ? lowSource : artworkSized(uri, (size ?? 120) * PixelRatio.get())) : undefined;
  // An image that was already shown this session appears at once (no fade over the placeholder).
  const known = wasShown(source);
  const imageSource = useMemo(() => ({ uri: source }), [source]);
  const dim = size ? { width: size, height: size } : { width: '100%' as const, aspectRatio: 1 };
  return (
    <View style={[styles.box, dim, { borderRadius: radius, backgroundColor: colorFor(title) }, style]}>
      {known ? null : <Text style={[styles.initial, { fontSize: size ? size * 0.4 : 36 }]}>{title.trim().charAt(0).toUpperCase()}</Text>}
      {uri ? (
        // Non-interactive so taps/drags reach the tile, and web doesn't start a native image drag.
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image
            source={imageSource}
            cachePolicy="memory-disk"
            recyclingKey={source}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            // While the sharp version loads, the small one (already cached) stands in.
            placeholder={!(low && lowSource) && lowSource && lowSource !== source ? { uri: lowSource } : undefined}
            placeholderContentFit="cover"
            transition={known || (low && !!lowSource) ? 0 : 150}
            onLoad={() => source && markShown(source)}
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initial: { color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
});
