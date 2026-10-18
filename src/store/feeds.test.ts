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
