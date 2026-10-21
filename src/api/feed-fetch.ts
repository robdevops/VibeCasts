import { Platform } from 'react-native';

import { feedCandidates, splitCredentials } from '@/lib/podcast-id';

export type FeedErrorKind = 'network' | 'auth' | 'http' | 'notfeed';

/** A feed couldn't be fetched or read. Messages never include the URL (it may hold a secret token). */
export class FeedError extends Error {
  constructor(
    message: string,
    readonly kind: FeedErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FeedError';
  }
}

/** Validators from a feed response, sent back next time so an unchanged feed costs a tiny 304 instead of the whole file. */
export type FeedValidators = { etag?: string; lastModified?: string };

/** The server says the feed hasn't changed since the validators we sent. */
export class FeedNotModified extends Error {
  constructor() {
    super('Feed not modified');
    this.name = 'FeedNotModified';
  }
}

/** Web can't fetch most feeds (CORS), so it goes through our same-origin API route. */
export const feedFetchUrl = (feedUrl: string) =>
  Platform.OS === 'web' ? `/api/feed?url=${encodeURIComponent(feedUrl)}` : feedUrl;

/** Fetch a feed's XML. Private links, tokens and `user:pass@` credentials are supported. */
export async function fetchFeedText(feedUrl: string): Promise<string> {
  return (await fetchFeedConditional(feedUrl)).text;
}

/**
 * Like `fetchFeedText`, but also returns the response's validators and, when given the validators
 * from last time, throws `FeedNotModified` for an unchanged feed (native only; web goes through our
 * proxy, which doesn't pass them on).
 */
export async function fetchFeedConditional(feedUrl: string, validators?: FeedValidators): Promise<{ text: string; validators: FeedValidators }> {
  const candidates = feedCandidates(feedUrl);
  for (let i = 0; i < candidates.length; i++) {
    try {
      return await fetchOne(candidates[i], validators);
    } catch (e) {
      // Access problems and "unchanged" are final; otherwise fall back to the next scheme.
      if (i === candidates.length - 1 || e instanceof FeedNotModified || (e instanceof FeedError && e.kind === 'auth')) throw e;
    }
  }
  throw new FeedError("Couldn't reach the feed. Check your connection and try again.", 'network');
}

/** How long to wait for a feed (its response and its body). */
const FETCH_TIMEOUT_MS = 30000;

async function fetchOne(feedUrl: string, validators?: FeedValidators): Promise<{ text: string; validators: FeedValidators }> {
  // A host that never answers, or stalls mid-body, must not hold a bulk refresh (or a backfill) forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchOneWithin(feedUrl, validators, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOneWithin(feedUrl: string, validators: FeedValidators | undefined, signal: AbortSignal): Promise<{ text: string; validators: FeedValidators }> {
  const { url, authorization } = splitCredentials(feedUrl);
  // On web the proxy needs the credentials, so it gets the original URL and builds the header itself.
  const target = Platform.OS === 'web' ? feedFetchUrl(feedUrl) : url;
  let res: Response;
  try {
    res = await fetch(target, {
      signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.5',
        ...(authorization && Platform.OS !== 'web' ? { Authorization: authorization } : null),
        ...(Platform.OS !== 'web' && validators?.etag ? { 'If-None-Match': validators.etag } : null),
        ...(Platform.OS !== 'web' && validators?.lastModified ? { 'If-Modified-Since': validators.lastModified } : null),
      },
    });
  } catch {
    throw new FeedError("Couldn't reach the feed. Check your connection and try again.", 'network');
  }
  if (res.status === 304) throw new FeedNotModified();
  if (res.status === 401 || res.status === 403) {
    throw new FeedError('The feed refused access. A private link may have expired or need a login.', 'auth', res.status);
  }
  if (!res.ok) throw new FeedError(`The feed returned an error (${res.status}).`, 'http', res.status);
  return { text: await readText(res), validators: { etag: res.headers.get('etag') ?? undefined, lastModified: res.headers.get('last-modified') ?? undefined } };
}

/** The body, with an aborted read reported like any other network failure. */
async function readText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    throw new FeedError("Couldn't reach the feed. Check your connection and try again.", 'network');
  }
}
