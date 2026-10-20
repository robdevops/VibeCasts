import { sortTiles } from './podcast-sort';

const tiles = [
  { key: 'p:b', name: 'beta', added: 2, latest: 30 },
  { key: 'p:a', name: 'Alpha', added: 3, latest: 10 },
  { key: 'f:1', name: 'News', added: 1, latest: 20 },
];

it('keeps custom order', () => expect(sortTiles(tiles, 'custom')).toEqual(['p:b', 'p:a', 'f:1']));
it('sorts by name ignoring case', () => expect(sortTiles(tiles, 'name')).toEqual(['p:a', 'p:b', 'f:1']));
it('sorts by newest subscription', () => expect(sortTiles(tiles, 'added')).toEqual(['p:a', 'p:b', 'f:1']));
it('sorts by latest episode', () => expect(sortTiles(tiles, 'recent')).toEqual(['p:b', 'f:1', 'p:a']));

it('lists a repeated tile once so the grid has no gaps', () => {
  const t = (key: string) => ({ key, name: key, added: 0, latest: 0 });
  expect(sortTiles([t('p:1'), t('p:2'), t('p:1')], 'custom')).toEqual(['p:1', 'p:2']);
});
