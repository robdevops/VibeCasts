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
