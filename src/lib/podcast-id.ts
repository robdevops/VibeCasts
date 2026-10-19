/** True for a pasted http(s) feed address (ignoring surrounding whitespace). */
export function isFeedUrl(input: string): boolean {
  const s = input.trim();
  if (!/^https?:\/\/\S+$/i.test(s)) return false;
  try {
    return !!new URL(s).hostname.includes('.') || new URL(s).hostname === 'localhost';
  } catch {
    return false;
  }
}

/** FNV-1a, 32-bit, as 8 hex chars. Stable and good enough to namespace feed URLs. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Id for a show that only has a feed URL. Never the raw URL: ids end up in route params and
 * in `podcastId|episodeId` keys, so they must not contain `|`, `/` or `?`.
 */
export function rssPodcastId(feedUrl: string): string {
  return `rss-${hash(feedUrl.trim().replace(/\/+$/, '').toLowerCase())}`;
}
