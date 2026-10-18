import { Image } from 'expo-image';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

const PALETTE = ['#E8A33D', '#5B8DEF', '#4CBF8B', '#C468D6', '#EF6C6C', '#4DB6C9', '#8A8D93'];

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

type Props = { uri?: string; title: string; size?: number; radius?: number; style?: StyleProp<ViewStyle> };

/** Square podcast artwork with a coloured initial as the fallback. */
export function Artwork({ uri, title, size, radius = 10, style }: Props) {
  const dim = size ? { width: size, height: size } : { width: '100%' as const, aspectRatio: 1 };
  return (
    <View style={[styles.box, dim, { borderRadius: radius, backgroundColor: colorFor(title) }, style]}>
      <Text style={[styles.initial, { fontSize: size ? size * 0.4 : 36 }]}>{title.trim().charAt(0).toUpperCase()}</Text>
      {uri ? (
        // Non-interactive so taps/drags reach the tile, and web doesn't start a native image drag.
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
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
