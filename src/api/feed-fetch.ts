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

/** Web can't fetch most feeds (CORS), so it goes through our same-origin API route. */
export const feedFetchUrl = (feedUrl: string) =>
  Platform.OS === 'web' ? `/api/feed?url=${encodeURIComponent(feedUrl)}` : feedUrl;

/** Fetch a feed's XML. Private links, tokens and `user:pass@` credentials are supported. */
export async function fetchFeedText(feedUrl: string): Promise<string> {
  const candidates = feedCandidates(feedUrl);
  for (let i = 0; i < candidates.length; i++) {
    try {
      return await fetchOne(candidates[i]);
    } catch (e) {
      // Access problems are final; otherwise fall back to the next scheme.
      if (i === candidates.length - 1 || (e instanceof FeedError && e.kind === 'auth')) throw e;
    }
  }
  throw new FeedError("Couldn't reach the feed. Check your connection and try again.", 'network');
}

async function fetchOne(feedUrl: string): Promise<string> {
  const { url, authorization } = splitCredentials(feedUrl);
  // On web the proxy needs the credentials, so it gets the original URL and builds the header itself.
  const target = Platform.OS === 'web' ? feedFetchUrl(feedUrl) : url;
  let res: Response;
  try {
    res = await fetch(target, {
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.5',
        ...(authorization && Platform.OS !== 'web' ? { Authorization: authorization } : null),
      },
    });
  } catch {
    throw new FeedError("Couldn't reach the feed. Check your connection and try again.", 'network');
  }
  if (res.status === 401 || res.status === 403) {
    throw new FeedError('The feed refused access. A private link may have expired or need a login.', 'auth', res.status);
  }
  if (!res.ok) throw new FeedError(`The feed returned an error (${res.status}).`, 'http', res.status);
  return res.text();
}
