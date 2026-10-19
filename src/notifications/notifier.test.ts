import type { Episode, Podcast } from '@/api/types';
import { createMemoryKV } from '@/db/storage';
import { episodeKey } from '@/lib/episode-state';
import { createLibraryStore } from '@/store/library';

import { createNotifier, type NotifyPlatform } from './notifier';

jest.mock('@/db/kv', () => ({ kv: {} }));

const podcast: Podcast = { id: 'p', title: 'Show', author: 'A', artwork: '', feedUrl: 'https://f' };
const ep = (id: string): Episode => ({ id, podcastId: 'p', title: `T ${id}`, description: '', audioUrl: 'u', published: 0, durationSec: 1 });

function setup(allowed = true) {
  const library = createLibraryStore(createMemoryKV());
  library.getState().subscribe(podcast);
  library.getState().setOverride('p', { notifications: true });
  let episodes: Episode[] | undefined;
  const posted: { id: string; title: string; body: string }[] = [];
  const platform: NotifyPlatform = { canPost: async () => allowed, post: async (n) => void posted.push(n) };
  const feeds = { getState: () => ({ feeds: episodes ? { p: { fetchedAt: 0, total: episodes.length, episodes } } : {} }) } as never;
  const notifier = createNotifier({ platform, storage: createMemoryKV(), library, feeds });
  return { library, notifier, posted, setEpisodes: (e: Episode[] | undefined) => (episodes = e) };
}

it('sets a baseline first and then announces only new episodes', async () => {
  const t = setup();
  t.setEpisodes([ep('b'), ep('a')]);
  expect(await t.notifier.check()).toBe(0);
  t.setEpisodes([ep('c'), ep('b'), ep('a')]);
  expect(await t.notifier.check()).toBe(1);
  expect(t.posted).toEqual([{ id: 'new-p', title: 'Show', body: 'T c', data: { podcastId: 'p', episodeId: 'c' } }]);
  expect(await t.notifier.check()).toBe(0); // not announced twice
});

it('waits for the first fetch instead of announcing a whole feed', async () => {
  const t = setup();
  t.setEpisodes(undefined);
  expect(await t.notifier.check()).toBe(0);
  t.setEpisodes([ep('b'), ep('a')]);
  expect(await t.notifier.check()).toBe(0);
  expect(t.posted).toEqual([]);
});

it('groups several new episodes into one notification', async () => {
  const t = setup();
  t.setEpisodes([ep('a')]);
  await t.notifier.check();
  t.setEpisodes([ep('c'), ep('b'), ep('a')]);
  await t.notifier.check();
  expect(t.posted[0].body).toBe('2 new episodes: T c');
});

it('stays quiet without permission, but still marks episodes as seen', async () => {
  const t = setup(false);
  t.setEpisodes([ep('a')]);
  await t.notifier.check();
  t.setEpisodes([ep('b'), ep('a')]);
  expect(await t.notifier.check()).toBe(0);
  expect(t.posted).toEqual([]);
});

it('does nothing for podcasts with notifications off, and skips already played episodes', async () => {
  const t = setup();
  t.setEpisodes([ep('a')]);
  await t.notifier.check();
  t.library.getState().patchEpisode(episodeKey('p', 'b'), { played: true });
  t.setEpisodes([ep('b'), ep('a')]);
  expect(await t.notifier.check()).toBe(0);
  t.library.getState().setOverride('p', { notifications: false });
  t.setEpisodes([ep('c'), ep('b'), ep('a')]);
  expect(await t.notifier.check()).toBe(0);
});
