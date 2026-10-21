import { createMemoryKV } from '@/db/storage';

import { bookmarksForEpisode, createBookmarkStore } from './bookmarks';

jest.mock('@/db/kv', () => ({ kv: {} }));

it('adds bookmarks, de-duplicates by second and lists them in time order', () => {
  const s = createBookmarkStore(createMemoryKV());
  s.getState().add('p', 'e', 300.4);
  s.getState().add('p', 'e', 60);
  const dup = s.getState().add('p', 'e', 60.2);
  s.getState().add('p', 'other', 5);
  expect(s.getState().items).toHaveLength(3);
  expect(dup.timeSec).toBe(60);
  expect(bookmarksForEpisode(s.getState().items, 'p', 'e').map((b) => b.timeSec)).toEqual([60, 300]);
});

it('removes a bookmark', () => {
  const s = createBookmarkStore(createMemoryKV());
  const b = s.getState().add('p', 'e', 10);
  s.getState().remove(b.id);
  expect(s.getState().items).toEqual([]);
});

describe('bookmarks keep their episode', () => {
  const ref = { podcast: { id: 'p', title: 'P', author: 'A', artwork: '', feedUrl: 'https://f/p' }, episode: { id: 'e', podcastId: 'p', title: 'E', audioUrl: 'https://a/e.mp3', published: 1, durationSec: 60 } };

  it('stores the episode given at creation, and adds one to older bookmarks only', () => {
    const s = createBookmarkStore(createMemoryKV());
    const old = s.getState().add('p', 'e', 10);
    const fresh = s.getState().add('p', 'e', 20, ref);
    expect(fresh.ref?.episode.title).toBe('E');
    s.getState().attachRefs({ [old.id]: ref, [fresh.id]: { ...ref, episode: { ...ref.episode, title: 'changed' } } });
    const items = s.getState().items;
    expect(items.find((b) => b.id === old.id)?.ref?.episode.title).toBe('E');
    expect(items.find((b) => b.id === fresh.id)?.ref?.episode.title).toBe('E'); // not overwritten
  });
});
