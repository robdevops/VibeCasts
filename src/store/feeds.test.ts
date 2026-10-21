import { sampleFeed } from '@/api/__fixtures__/feed.xml';
import { createMemoryKV } from '@/db/storage';

import { FeedNotModified } from '@/api/feed-fetch';

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
  expect(s.getState().feeds['1'].episodes).toHaveLength(20);
  expect(s.getState().feeds['1'].total).toBe(130);
  expect(s.getState().full['1'].meta.description).toBe('D');
});

it('remembers discovered podcasts and persists them', async () => {
  jest.useFakeTimers();
  const storage = createMemoryKV();
  const a = createFeedStore(storage, jest.fn());
  await a.getState().hydrate();
  a.getState().remember(pod);
  jest.advanceTimersByTime(4000);
  jest.useRealTimers();
  await Promise.resolve();
  const b = createFeedStore(storage, jest.fn());
  await b.getState().hydrate();
  expect(b.getState().known['1']).toMatchObject({ title: 'P' });
});

it('persists a slim cache without show notes', async () => {
  jest.useFakeTimers();
  const storage = createMemoryKV();
  const s = createFeedStore(storage, jest.fn().mockResolvedValue(sampleFeed));
  await s.getState().hydrate();
  await s.getState().refresh(pod);
  expect(s.getState().feeds['1'].episodes.some((e) => e.description)).toBe(true);
  jest.advanceTimersByTime(4000);
  jest.useRealTimers();
  await Promise.resolve();
  const saved = JSON.parse((await storage.getItem('feeds.v1')) ?? '{}');
  expect(saved.feeds['1'].episodes).toHaveLength(3);
  expect(saved.feeds['1'].episodes.some((e: { description?: string }) => e.description)).toBe(false);
});

it('backfills imported shows 3 at a time and clears needsMeta through onMeta', async () => {
  let running = 0;
  let peak = 0;
  const fetchText = jest.fn(async () => {
    peak = Math.max(peak, ++running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    return sampleFeed;
  });
  const onMeta = jest.fn();
  const s = createFeedStore(createMemoryKV(), fetchText, onMeta);
  const pods = Array.from({ length: 7 }, (_, i) => ({ ...pod, id: `r${i}`, feedUrl: `https://f/${i}`, needsMeta: true }));
  await s.getState().backfill([...pods, { ...pod, id: 'done' }]);
  expect(fetchText).toHaveBeenCalledTimes(7);
  expect(peak).toBe(3);
  expect(onMeta).toHaveBeenCalledTimes(7);
  expect(s.getState().backfillProgress).toBeNull();
});

it('backfill can fetch just the shows a caller picks, and shows what it is doing', async () => {
  const fetchText = jest.fn(async () => sampleFeed);
  const labels: (string | undefined)[] = [];
  const s = createFeedStore(createMemoryKV(), fetchText);
  s.subscribe((st) => labels.push(st.backfillProgress?.label));
  const pods = [{ ...pod, id: 'a', feedUrl: 'https://f/a', category: 'News' }, { ...pod, id: 'b', feedUrl: 'https://f/b' }];
  await s.getState().backfill(pods, { need: (p) => !p.category, label: 'Finding categories' });
  expect(fetchText).toHaveBeenCalledTimes(1);
  expect(labels).toContain('Finding categories');
});

describe('conditional refresh (unchanged feeds cost almost nothing)', () => {
  it('sends the saved validators on bulk refreshes and keeps the cache on 304', async () => {
    const calls: (string | undefined)[] = [];
    const fetchText = jest.fn(async (_url: string, v?: { etag?: string }) => {
      calls.push(v?.etag);
      if (v?.etag === '"v1"') throw new FeedNotModified();
      return { text: sampleFeed, validators: { etag: '"v1"', lastModified: 'Tue, 01 Jan 2030 00:00:00 GMT' } };
    });
    const s = createFeedStore(createMemoryKV(), fetchText);
    await s.getState().refresh(pod); // first fetch: full, remembers the validators
    expect(s.getState().feeds['1'].validators?.etag).toBe('"v1"');
    const firstFetch = s.getState().feeds['1'].fetchedAt;

    await new Promise((r) => setTimeout(r, 5));
    await s.getState().refreshAll([pod]); // bulk: conditional, answered 304
    expect(calls).toEqual([undefined, '"v1"']);
    expect(s.getState().feeds['1'].total).toBe(3); // cache kept
    expect(s.getState().feeds['1'].episodes).toHaveLength(3);
    expect(s.getState().feeds['1'].fetchedAt).toBeGreaterThan(firstFetch); // counts as fresh
  });

  it('a normal refresh (opening the page, pull to refresh) always fetches the whole feed', async () => {
    const calls: (string | undefined)[] = [];
    const fetchText = jest.fn(async (_url: string, v?: { etag?: string }) => {
      calls.push(v?.etag);
      return { text: sampleFeed, validators: { etag: '"v1"' } };
    });
    const s = createFeedStore(createMemoryKV(), fetchText);
    await s.getState().refresh(pod);
    await s.getState().refresh(pod);
    expect(calls).toEqual([undefined, undefined]);
  });
});

describe('visible-first refresh', () => {
  const shows = Array.from({ length: 8 }, (_, i) => ({ ...pod, id: `s${i}`, feedUrl: `https://f/${i}` }));
  const order = () => {
    const seen: string[] = [];
    const gates: (() => void)[] = [];
    const fetchText = jest.fn((url: string) => {
      seen.push(url.split('/').pop()!);
      return new Promise<string>((resolve) => gates.push(() => resolve(sampleFeed)));
    });
    return { seen, gates, fetchText };
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('fetches in the screen\'s order, not the order the shows are stored', async () => {
    const t = order();
    const s = createFeedStore(createMemoryKV(), t.fetchText);
    s.getState().setPriority(['s7', 's6', 's5', 's4', 's3', 's2', 's1', 's0']);
    const done = s.getState().refreshAll(shows);
    await flush();
    expect(t.seen).toEqual(['7', '6', '5', '4']); // the first four workers took the most wanted
    t.gates.forEach((g) => g());
    await flush();
    t.gates.forEach((g) => g());
    await done;
    expect(t.seen).toEqual(['7', '6', '5', '4', '3', '2', '1', '0']);
  });

  it('re-prioritises while running: scrolling moves the wanted shows to the front', async () => {
    const t = order();
    const s = createFeedStore(createMemoryKV(), t.fetchText);
    s.getState().setPriority(shows.map((p) => p.id));
    const done = s.getState().refreshAll(shows);
    await flush();
    expect(t.seen).toEqual(['0', '1', '2', '3']);
    s.getState().setPriority(['s7', 's6', 's0', 's1', 's2', 's3', 's4', 's5']); // the user scrolled to the bottom
    t.gates.splice(0).forEach((g) => g());
    await flush();
    expect(t.seen.slice(4, 8)).toEqual(['7', '6', '4', '5']);
    t.gates.splice(0).forEach((g) => g());
    await flush();
    t.gates.splice(0).forEach((g) => g());
    await done;
  });

  it('waits while nobody is looking and carries on when they are', async () => {
    const t = order();
    const s = createFeedStore(createMemoryKV(), t.fetchText);
    const done = s.getState().refreshAll(shows.slice(0, 2), { whileLooking: true });
    await flush();
    expect(t.seen).toEqual([]); // phone locked / other tab: nothing fetched
    s.getState().setLooking(true);
    await flush();
    expect(t.seen).toHaveLength(2);
    t.gates.splice(0).forEach((g) => g());
    await done;
  });

  it('background refreshes (no screen) do not wait', async () => {
    const t = order();
    const s = createFeedStore(createMemoryKV(), t.fetchText);
    const done = s.getState().refreshAll(shows.slice(0, 2));
    await flush();
    expect(t.seen).toHaveLength(2);
    t.gates.splice(0).forEach((g) => g());
    await done;
  });
});

describe('whole feeds in memory', () => {
  const show = (n: number) => ({ ...pod, id: String(n), feedUrl: `https://f${n}.example/rss` });

  it('a bulk refresh keeps only the newest episodes, not the whole feed', async () => {
    const s = createFeedStore(createMemoryKV(), jest.fn(async () => sampleFeed));
    await s.getState().refreshAll([show(1), show(2)]);
    expect(Object.keys(s.getState().feeds)).toEqual(['1', '2']);
    expect(s.getState().full).toEqual({});
  });

  it('a show that is already held in full stays fresh through a bulk refresh', async () => {
    const s = createFeedStore(createMemoryKV(), jest.fn(async () => sampleFeed));
    await s.getState().refresh(show(1));
    expect(s.getState().full['1']).toBeDefined();
    await s.getState().refreshAll([show(1)]);
    expect(s.getState().full['1']).toBeDefined();
  });

  it('holds at most a few whole feeds, dropping the oldest', async () => {
    const s = createFeedStore(createMemoryKV(), jest.fn(async () => sampleFeed));
    for (let n = 1; n <= 9; n++) await s.getState().refresh(show(n));
    expect(Object.keys(s.getState().full)).toEqual(['4', '5', '6', '7', '8', '9']);
    expect(Object.keys(s.getState().feeds)).toHaveLength(9);
  });
});

describe('whole feeds in memory: recency, pins and requests that arrive mid-fetch', () => {
  const show = (id: string | number) => ({ ...pod, id: String(id), feedUrl: `https://f${id}.example/rss` });

  it('evicts the least recently fetched show, also for integer-like (iTunes) ids', async () => {
    const s = createFeedStore(createMemoryKV(), jest.fn(async () => sampleFeed));
    for (const id of [1700000001, 1700000002, 1700000003, 1700000004, 1700000005, 1700000006, 1200361736]) await s.getState().refresh(show(id));
    expect(Object.keys(s.getState().full)).toContain('1200361736'); // the one just opened stays
    expect(Object.keys(s.getState().full)).not.toContain('1700000001'); // the oldest goes
    expect(Object.keys(s.getState().full)).toHaveLength(6);
  });

  it('keeps a show a screen is using, until the screen lets go', async () => {
    const s = createFeedStore(createMemoryKV(), jest.fn(async () => sampleFeed));
    await s.getState().refresh(show(1));
    const release = s.getState().pinFull('1');
    for (let n = 2; n <= 9; n++) await s.getState().refresh(show(n));
    expect(s.getState().full['1']).toBeDefined();
    release();
    await s.getState().refresh(show(10));
    expect(s.getState().full['1']).toBeUndefined();
  });

  it('a whole-feed request that arrives during a bulk fetch of the same show gets the whole feed', async () => {
    let finish: (v: string) => void = () => {};
    const fetchText = jest.fn(() => new Promise<string>((r) => (finish = r)));
    const s = createFeedStore(createMemoryKV(), fetchText);
    const bulk = s.getState().refreshAll([show(1)]); // keeps only the newest episodes
    await new Promise((r) => setTimeout(r, 0));
    await s.getState().refresh(show(1)); // the page asks while that is in flight: dropped, but remembered
    finish(sampleFeed);
    await bulk;
    expect(s.getState().full['1']).toBeDefined();
    expect(fetchText).toHaveBeenCalledTimes(1);
  });

  it('fetches again when the in-flight bulk fetch came back unchanged (304)', async () => {
    const calls: (string | undefined)[] = [];
    let release: () => void = () => {};
    let hold = false;
    const fetchText = jest.fn(async (_u: string, v?: { etag?: string }) => {
      calls.push(v?.etag);
      if (hold) {
        await new Promise<void>((r) => (release = r));
        throw new FeedNotModified();
      }
      return { text: sampleFeed, validators: { etag: '"v1"' } };
    });
    const s = createFeedStore(createMemoryKV(), fetchText);
    await s.getState().refresh(show(1)); // seeds the validators
    for (let n = 2; n <= 8; n++) await s.getState().refresh(show(n)); // show 1's whole feed is evicted
    expect(s.getState().full['1']).toBeUndefined();
    hold = true;
    const bulk = s.getState().refreshAll([show(1)]); // conditional: will come back 304
    await new Promise((r) => setTimeout(r, 0));
    await s.getState().refresh(show(1)); // a page opens meanwhile: dropped, but remembered
    hold = false;
    release();
    await bulk;
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.slice(-2)).toEqual(['"v1"', undefined]); // the 304, then one plain fetch
    expect(s.getState().full['1']).toBeDefined();
  });
});
