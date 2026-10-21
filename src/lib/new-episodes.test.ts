import type { Episode } from '@/api/types';

import { findNewEpisodes, notificationText, SEEN_LIMIT } from './new-episodes';

const ep = (id: string): Episode => ({ id, podcastId: 'p', title: `Title ${id}`, description: '', audioUrl: 'u', published: 0, durationSec: 1 });

describe('findNewEpisodes', () => {
  it('sets a baseline the first time without announcing anything', () => {
    const r = findNewEpisodes([ep('c'), ep('b'), ep('a')], undefined);
    expect(r.fresh).toEqual([]);
    expect(r.seen).toEqual(['c', 'b', 'a']);
  });

  it('reports only episodes not seen before, and remembers them', () => {
    const r = findNewEpisodes([ep('d'), ep('c'), ep('b')], ['c', 'b', 'a']);
    expect(r.fresh.map((e) => e.id)).toEqual(['d']);
    expect(r.seen).toEqual(['d', 'c', 'b', 'a']);
    expect(findNewEpisodes([ep('d'), ep('c')], r.seen).fresh).toEqual([]);
  });

  it('caps what it remembers', () => {
    const many = Array.from({ length: SEEN_LIMIT + 20 }, (_, i) => ep(`e${i}`));
    expect(findNewEpisodes(many, undefined).seen).toHaveLength(SEEN_LIMIT);
  });
});

describe('notificationText', () => {
  it('names a single episode, or counts several', () => {
    expect(notificationText('Show', [ep('a')])).toEqual({ title: 'Show', body: 'Title a' });
    expect(notificationText('Show', [ep('b'), ep('a')])).toEqual({ title: 'Show', body: '2 new episodes: Title b' });
  });
});
