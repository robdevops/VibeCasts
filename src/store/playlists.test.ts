import type { Podcast } from '@/api/types';
import { createMemoryKV } from '@/db/storage';
import { toRef } from '@/lib/playlist';

import { createPlaylistStore } from './playlists';

jest.mock('@/db/kv', () => ({ kv: {} }));

const podcast: Podcast = { id: 'p', title: 'Show', author: 'A', artwork: '', feedUrl: 'https://f' };
const ref = (id: string) => toRef({ id, podcastId: 'p', title: id, description: '', audioUrl: 'u', published: 0, durationSec: 1 }, podcast);
const ids = (items: { episode: { id: string } }[]) => items.map((r) => r.episode.id);

it('queues episodes next or last without duplicates, and takes them in order', () => {
  const s = createPlaylistStore(createMemoryKV());
  s.getState().playLast([ref('a'), ref('b')]);
  s.getState().playNext([ref('c')]);
  s.getState().playLast([ref('a')]); // already queued
  expect(ids(s.getState().upNext)).toEqual(['c', 'a', 'b']);
  expect(s.getState().takeNext()?.episode.id).toBe('c');
  expect(ids(s.getState().upNext)).toEqual(['a', 'b']);
  s.getState().forget('p|b');
  s.getState().forget('p|nope');
  expect(ids(s.getState().upNext)).toEqual(['a']);
  expect(s.getState().takeNext()?.episode.id).toBe('a');
  expect(s.getState().takeNext()).toBeUndefined();
});

it('reorders and clears the queue', () => {
  const s = createPlaylistStore(createMemoryKV());
  s.getState().playLast([ref('a'), ref('b'), ref('c')]);
  s.getState().moveInQueue(2, 0);
  expect(ids(s.getState().upNext)).toEqual(['c', 'a', 'b']);
  s.getState().removeFromQueue('p|a');
  expect(ids(s.getState().upNext)).toEqual(['c', 'b']);
  s.getState().clearQueue();
  expect(s.getState().upNext).toEqual([]);
});

it('creates, renames, fills, reorders and deletes playlists', () => {
  const s = createPlaylistStore(createMemoryKV());
  const id = s.getState().createPlaylist('  Commute ');
  expect(s.getState().playlists[0]).toMatchObject({ id, name: 'Commute', items: [] });
  s.getState().addToPlaylist(id, [ref('a'), ref('b')]);
  s.getState().addToPlaylist(id, [ref('b'), ref('c')]);
  expect(ids(s.getState().playlists[0].items)).toEqual(['a', 'b', 'c']);
  s.getState().moveInPlaylist(id, 0, 2);
  s.getState().removeFromPlaylist(id, 'p|b');
  expect(ids(s.getState().playlists[0].items)).toEqual(['c', 'a']);
  s.getState().renamePlaylist(id, 'Gym');
  s.getState().renamePlaylist(id, '   '); // blank keeps the old name
  expect(s.getState().playlists[0].name).toBe('Gym');
  s.getState().deletePlaylist(id);
  expect(s.getState().playlists).toEqual([]);
});

it('persists and restores', async () => {
  jest.useFakeTimers();
  const storage = createMemoryKV();
  const a = createPlaylistStore(storage);
  await a.getState().hydrate();
  a.getState().playLast([ref('a')]);
  a.getState().createPlaylist('Mine');
  jest.advanceTimersByTime(1000);
  jest.useRealTimers();
  await Promise.resolve();
  const b = createPlaylistStore(storage);
  await b.getState().hydrate();
  expect(ids(b.getState().upNext)).toEqual(['a']);
  expect(b.getState().playlists[0].name).toBe('Mine');
});
