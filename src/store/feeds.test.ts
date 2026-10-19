import { sampleFeed } from '@/api/__fixtures__/feed.xml';
import { createMemoryKV } from '@/db/storage';

import { createFeedStore } from './feeds';

jest.mock('@/db/kv', () => ({ kv: {} }));

const pod = { id: '1', title: 'P', author: 'A', artwork: '', feedUrl: 'https://f/1' };

it('fetches, parses and sorts newest first', async () => {
  const fetchText = jest.fn().mockResolvedValue(sampleFeed);
  const s = createFeedStore(createMemoryKV(), fetchText);
  await s.getState().refresh(pod);
  const entry = s.getState().feeds['1'];
  expect(entry.total).toBe(3);
  expect(entry.episodes[0].id).toBe('ep-3');
  expect(entry.episodes[0].podcastId).toBe('1');
  expect(s.getState().loading).toEqual({});
});

it('keeps the cache when a refresh fails', async () => {
  const fetchText = jest.fn().mockResolvedValueOnce(sampleFeed).mockRejectedValueOnce(new Error('offline'));
  const s = createFeedStore(createMemoryKV(), fetchText);
  await s.getState().refresh(pod);
  await s.getState().refresh(pod);
  expect(s.getState().feeds['1'].total).toBe(3);
});

it('refreshAll with onlyStale skips fresh feeds', async () => {
  const fetchText = jest.fn().mockResolvedValue(sampleFeed);
  const s = createFeedStore(createMemoryKV(), fetchText);
  await s.getState().refreshAll([pod]);
  await s.getState().refreshAll([pod], { onlyStale: true });
  expect(fetchText).toHaveBeenCalledTimes(1);
});

it('keeps the whole feed in memory but caches only the newest episodes', async () => {
  const items = Array.from(
    { length: 130 },
    (_, i) =>
      `<item><title>E${i}</title><guid>g${i}</guid><pubDate>${new Date(1_700_000_000_000 + i * 86_400_000).toUTCString()}</pubDate><enclosure url="https://x/${i}.mp3" type="audio/mpeg" length="1"/></item>`,
  ).join('');
  const xml = `<rss version="2.0"><channel><title>Big</title><description>D</description>${items}</channel></rss>`;
  const s = createFeedStore(createMemoryKV(), jest.fn().mockResolvedValue(xml));
  await s.getState().refresh(pod);
  expect(s.getState().full['1'].episodes).toHaveLength(130);
  expect(s.getState().feeds['1'].episodes).toHaveLength(100);
  expect(s.getState().feeds['1'].total).toBe(130);
  expect(s.getState().full['1'].meta.description).toBe('D');
});

it('remembers discovered podcasts and persists them', async () => {
  jest.useFakeTimers();
  const storage = createMemoryKV();
  const a = createFeedStore(storage, jest.fn());
  await a.getState().hydrate();
  a.getState().remember(pod);
  jest.advanceTimersByTime(1000);
  jest.useRealTimers();
  await Promise.resolve();
  const b = createFeedStore(storage, jest.fn());
  await b.getState().hydrate();
  expect(b.getState().known['1']).toMatchObject({ title: 'P' });
});
