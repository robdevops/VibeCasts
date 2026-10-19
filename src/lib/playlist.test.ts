import type { Podcast } from '@/api/types';

import { addRefs, fromRef, moveRef, refKey, removeRef, toRef } from './playlist';

const podcast: Podcast = { id: 'p', title: 'Show', author: 'A', artwork: 'art', feedUrl: 'https://f' };
const ref = (id: string) => toRef({ id, podcastId: 'p', title: `T ${id}`, description: 'long notes', audioUrl: `https://a/${id}.mp3`, published: 1, durationSec: 60 }, podcast);
const keys = (items: { podcast: { id: string }; episode: { id: string } }[]) => items.map((r) => r.episode.id);

describe('refs', () => {
  it('drops show notes when saving and restores a playable episode', () => {
    const r = ref('a');
    expect('description' in r.episode).toBe(false);
    const full = fromRef(r);
    expect(full.episode).toMatchObject({ id: 'a', description: '', audioUrl: 'https://a/a.mp3' });
    expect(full.podcast.title).toBe('Show');
    expect(refKey(r)).toBe('p|a');
  });
});

describe('addRefs', () => {
  const base = [ref('a'), ref('b')];

  it('appends only what is not already there', () => {
    expect(keys(addRefs(base, [ref('b'), ref('c'), ref('c')], 'last'))).toEqual(['a', 'b', 'c']);
  });

  it('puts them first in order and moves existing ones up front', () => {
    expect(keys(addRefs(base, [ref('c'), ref('b')], 'first'))).toEqual(['c', 'b', 'a']);
  });
});

describe('removeRef and moveRef', () => {
  it('removes by key', () => {
    expect(keys(removeRef([ref('a'), ref('b')], 'p|a'))).toEqual(['b']);
  });

  it('moves and clamps', () => {
    expect(moveRef([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveRef([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(moveRef([1, 2, 3], 1, 9)).toEqual([1, 3, 2]);
    expect(moveRef([1, 2, 3], 5, 0)).toEqual([1, 2, 3]);
  });
});
