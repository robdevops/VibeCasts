import { FeedError, fetchFeedText } from '@/api/feed-fetch';
import { parseFeed } from '@/api/rss';
import type { Podcast } from '@/api/types';
import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';

import { hostLabel, rssPodcastId, toFeedUrl } from './podcast-id';

export type AddFeedResult = { status: 'added' | 'existing'; podcast: Podcast };

type Deps = {
  fetchText: (url: string) => Promise<string>;
  library: Pick<typeof useLibrary, 'getState'>;
  feeds: Pick<typeof useFeeds, 'getState'>;
};

/**
 * Subscribe to a podcast from a pasted feed address (private/tokenised links included). Errors
 * are `FeedError`s whose messages never contain the URL, since it may hold a secret.
 */
export async function addFeedFromUrl(
  input: string,
  { fetchText = fetchFeedText, library = useLibrary, feeds = useFeeds }: Partial<Deps> = {},
): Promise<AddFeedResult> {
  const url = toFeedUrl(input);
  if (!url) throw new FeedError("That doesn't look like a web address.", 'notfeed');

  const id = rssPodcastId(url);
  const existing = library.getState().subscriptions[id];
  if (existing) return { status: 'existing', podcast: existing.podcast };

  const xml = await fetchText(url);
  let parsed;
  try {
    parsed = parseFeed(xml);
  } catch {
    throw new FeedError("That link didn't return a podcast feed.", 'notfeed');
  }

  const podcast: Podcast = {
    id,
    title: parsed.podcast.title || hostLabel(url),
    author: parsed.podcast.author,
    artwork: parsed.podcast.artwork,
    feedUrl: url,
    category: parsed.podcast.category,
    description: parsed.podcast.description,
    website: parsed.podcast.website,
  };
  feeds.getState().remember(podcast);
  library.getState().subscribe(podcast);
  feeds.getState().ingest(podcast, parsed);
  return { status: 'added', podcast };
}
