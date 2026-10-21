import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { PixelRatio, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { thumbFailed, tileThumbPx, useThumb } from '@/artwork/thumbs';
import { artworkSized } from '@/lib/artwork';
import { markShown, wasShown } from '@/lib/shown-images';

const PALETTE = ['#E8A33D', '#5B8DEF', '#4CBF8B', '#C468D6', '#EF6C6C', '#4DB6C9', '#8A8D93'];

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

type Props = {
  uri?: string;
  title: string;
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityRole?: 'button';
};

/** Square podcast artwork with a coloured initial as the fallback. */
export function Artwork({ uri, title, size, radius = 10, style, accessibilityLabel, accessibilityRole }: Props) {
  // The placeholder letter is only needed until the picture is there. Which picture loaded is remembered (not just
  // "one did"): an instance that stays mounted while its show changes (the mini player) must show the letter again.
  const [loadedFor, setLoadedFor] = useState<string>();
  // Tiles fill their column (no fixed size): ~110 pt on a phone.
  const wantPx = (size ?? 120) * PixelRatio.get();
  const full = uri ? artworkSized(uri, wantPx) : undefined;
  // A tile-sized copy made on the phone (hosts that can't resize by URL): far quicker to decode than a 2000 px original.
  const thumbPx = tileThumbPx();
  const thumb = useThumb(uri, thumbPx);
  const source = thumb && wantPx <= thumbPx ? thumb : full;
  // An image that was already shown this session appears at once (no fade over the placeholder), including when the
  // tile-sized copy takes over from the full image.
  const known = wasShown(source) || wasShown(full);
  const imageSource = useMemo(() => ({ uri: source }), [source]);
  const dim = size ? { width: size, height: size } : { width: '100%' as const, aspectRatio: 1 };
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      style={[styles.box, dim, { borderRadius: radius, backgroundColor: colorFor(title) }, style]}>
      {known || (!!source && loadedFor === source) ? null : <Text style={[styles.initial, { fontSize: size ? size * 0.4 : 36 }]}>{title.trim().charAt(0).toUpperCase()}</Text>}
      {uri ? (
        // Non-interactive so taps/drags reach the tile, and web doesn't start a native image drag.
        <Image
          source={imageSource}
          cachePolicy="memory-disk"
          recyclingKey={source}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={known ? 0 : 150}
          onLoad={() => {
            if (source) markShown(source);
            setLoadedFor(source);
          }}
          onError={() => {
            if (uri && source !== full && source === thumb) thumbFailed(uri, thumbPx); // fall back to the full image
          }}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initial: { color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
});
