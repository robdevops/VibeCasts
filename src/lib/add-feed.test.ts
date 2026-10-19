import { sampleFeed } from '@/api/__fixtures__/feed.xml';
import { FeedError } from '@/api/feed-fetch';
import { createMemoryKV } from '@/db/storage';
import { createFeedStore } from '@/store/feeds';
import { createLibraryStore } from '@/store/library';

import { addFeedFromUrl } from './add-feed';
import { rssPodcastId } from './podcast-id';

jest.mock('@/db/kv', () => ({ kv: {} }));

const PRIVATE = 'https://rss.example.org/feed/80C38624-5894?token=SeCrEt-Tok3n';

function setup(xml: string | Error = sampleFeed) {
  const library = createLibraryStore(createMemoryKV());
  const fetchText = jest.fn(async () => {
    if (xml instanceof Error) throw xml;
    return xml;
  });
  const feeds = createFeedStore(createMemoryKV(), fetchText);
  return { library, feeds, fetchText, deps: { fetchText, library, feeds } };
}

it('adds a private, tokenised feed URL exactly as given and subscribes', async () => {
  const t = setup();
  const r = await addFeedFromUrl(`  ${PRIVATE}\n`, t.deps);
  expect(r.status).toBe('added');
  expect(t.fetchText).toHaveBeenCalledWith(PRIVATE);
  const id = rssPodcastId(PRIVATE);
  expect(t.library.getState().subscriptions[id].podcast).toMatchObject({ title: 'Sample Show', feedUrl: PRIVATE, author: 'Sample Author' });
  // Episodes are stored from the same fetch: no second request.
  expect(t.feeds.getState().feeds[id].episodes).toHaveLength(3);
  expect(t.fetchText).toHaveBeenCalledTimes(1);
});

it('reports a feed that is already in the library without refetching', async () => {
  const t = setup();
  await addFeedFromUrl(PRIVATE, t.deps);
  const again = await addFeedFromUrl(PRIVATE, t.deps);
  expect(again.status).toBe('existing');
  expect(t.fetchText).toHaveBeenCalledTimes(1);
});

it('maps feed:// links', async () => {
  const t = setup();
  await addFeedFromUrl('feed://example.com/rss', t.deps);
  expect(t.fetchText).toHaveBeenCalledWith('http://example.com/rss');
});

it('rejects non-URLs without any request', async () => {
  const t = setup();
  await expect(addFeedFromUrl('radio davos', t.deps)).rejects.toMatchObject({ kind: 'notfeed' });
  expect(t.fetchText).not.toHaveBeenCalled();
});

it('explains a page that is not a feed, without leaking the URL', async () => {
  const t = setup('<html><body>login</body></html>');
  const err = await addFeedFromUrl(PRIVATE, t.deps).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(FeedError);
  expect((err as FeedError).kind).toBe('notfeed');
  expect((err as FeedError).message).not.toContain('SeCrEt');
  expect(Object.keys(t.library.getState().subscriptions)).toHaveLength(0);
});

it('passes network and auth failures through and subscribes to nothing', async () => {
  const t = setup(new FeedError('The feed refused access.', 'auth', 403));
  await expect(addFeedFromUrl(PRIVATE, t.deps)).rejects.toMatchObject({ kind: 'auth' });
  expect(Object.keys(t.library.getState().subscriptions)).toHaveLength(0);
});
