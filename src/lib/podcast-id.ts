const PODCAST_SCHEMES = /^(?:feed|pcast|itpc|podcast):(?:\/\/)?/i;

/**
 * Turn whatever the user typed or pasted into a fetchable feed URL, or `null` if it isn't one.
 *
 * Accepts any http(s) URL with a host: private subscriber links with tokens, query strings, ports,
 * IP addresses and single-label intranet names. Podcast-app schemes (`feed://`, `pcast://`,
 * `itpc://`, `feed:https://...`) are mapped to http(s). Surrounding whitespace is dropped; nothing
 * else about the URL is changed (tokens are case-sensitive).
 */
export function toFeedUrl(input: string): string | null {
  let s = input.trim();
  if (!s || /\s/.test(s)) return null;
  if (PODCAST_SCHEMES.test(s)) {
    const rest = s.replace(PODCAST_SCHEMES, '');
    s = /^https?:\/\//i.test(rest) ? rest : `http://${rest}`;
  }
  if (!/^https?:\/\/[^/?#]+/i.test(s)) return null;
  try {
    return new URL(s).hostname ? s : null;
  } catch {
    return null;
  }
}

/** True when the text is a feed address (and so should be added, not searched for). */
export const isFeedUrl = (input: string): boolean => toFeedUrl(input) !== null;

/**
 * Split `user:pass@host` credentials out of a URL: fetch refuses URLs that carry them, so they
 * travel as a Basic Authorization header instead. The returned URL is safe to fetch and display.
 */
export function splitCredentials(url: string): { url: string; authorization?: string } {
  try {
    const u = new URL(url);
    if (!u.username && !u.password) return { url };
    const user = decodeURIComponent(u.username);
    const pass = decodeURIComponent(u.password);
    u.username = '';
    u.password = '';
    const raw = `${user}:${pass}`;
    // btoa wants Latin-1, so UTF-8 encode first.
    const b64 = btoa(unescape(encodeURIComponent(raw)));
    return { url: u.toString(), authorization: `Basic ${b64}` };
  } catch {
    return { url };
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

/** Lowercase scheme and host only: paths and query strings (and so private tokens) are case-sensitive. */
function canonical(feedUrl: string): string {
  const s = feedUrl.trim();
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}${u.hash}`;
  } catch {
    return s.replace(/\/+$/, '');
  }
}

/**
 * Id for a show that only has a feed URL. Never the raw URL: ids end up in route params and in
 * `podcastId|episodeId` keys, so they must not contain `|`, `/` or `?`.
 */
export function rssPodcastId(feedUrl: string): string {
  return `rss-${hash(canonical(feedUrl))}`;
}

/** "https://www.example.com/path?token=x" -> "example.com". Never reveals the path or query. */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/i, '').split(/[/?#]/)[0];
  }
}

/** URLs to try, in order. A plain http feed is tried over https first (most hosts redirect or support it). */
export function feedCandidates(url: string): string[] {
  return /^http:\/\//i.test(url) ? [url.replace(/^http:/i, 'https:'), url] : [url];
}
