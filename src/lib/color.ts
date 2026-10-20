/** Relative luminance (0 dark .. 1 light) of a `#rrggbb` / `#rgb` colour; mid-grey for anything it can't parse. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const channel = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** White or near-black, whichever reads better on this background colour. */
export function readableOn(background: string): string {
  return luminance(background) > 0.35 ? '#1B1B1F' : '#FFFFFF';
}
