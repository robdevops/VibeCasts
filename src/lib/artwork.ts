/**
 * Ask the image CDN for about the size we show. iTunes artwork URLs carry their size
 * (`.../600x600bb.jpg`); the originals can be 1400-3000 px, which is slow to download and decode
 * for a 110 px tile. Other hosts are returned unchanged.
 */
export function artworkSized(uri: string, px: number): string {
  const target = Math.max(100, Math.ceil(px / 100) * 100);
  const memo = `${target}|${uri}`;
  const hit = sizedCache.get(memo);
  if (hit !== undefined) return hit;
  const sized = resize(uri, target);
  // Every tile asks on every render; the answer only depends on the pair. Bounded, oldest out first.
  if (sizedCache.size >= 1500) sizedCache.delete(sizedCache.keys().next().value as string);
  sizedCache.set(memo, sized);
  return sized;
}

const sizedCache = new Map<string, string>();

function resize(uri: string, target: number): string {
  if (!/mzstatic\.com/i.test(uri)) return uri;
  return uri.replace(/\/\d+x\d+(bb|ss)?(-\d+)?\.(jpg|jpeg|png|webp)(\?.*)?$/i, (_m, mode = 'bb', q = '', ext, qs = '') => `/${target}x${target}${mode}${q}.${ext}${qs}`);
}
