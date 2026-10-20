/**
 * Ask the image CDN for about the size we show. iTunes artwork URLs carry their size
 * (`.../600x600bb.jpg`); the originals can be 1400-3000 px, which is slow to download and decode
 * for a 110 px tile. Other hosts are returned unchanged.
 */
export function artworkSized(uri: string, px: number): string {
  if (!/mzstatic\.com/i.test(uri)) return uri;
  const target = Math.max(100, Math.ceil(px / 100) * 100);
  return uri.replace(/\/\d+x\d+(bb|ss)?(-\d+)?\.(jpg|jpeg|png|webp)(\?.*)?$/i, (_m, mode = 'bb', q = '', ext, qs = '') => `/${target}x${target}${mode}${q}.${ext}${qs}`);
}

/** The smallest version we ask for: used for tiles that are mounted but well off screen, and as the placeholder while a sharper one loads. */
export const LOW_ART_PX = 100;
export const artworkLow = (uri: string): string => artworkSized(uri, LOW_ART_PX);
