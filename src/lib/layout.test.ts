import { parseKey, reorder, tileKey } from './layout';

it('reorders', () => {
  expect(reorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  expect(reorder(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
});
it('ignores bad indices', () => {
  const l = ['a', 'b'];
  expect(reorder(l, 0, 5)).toBe(l);
});
it('keys tiles', () => {
  expect(tileKey({ type: 'folder', id: '1' })).toBe('f:1');
});

it('parses tile keys', () => {
  expect(parseKey('f:abc')).toEqual({ type: 'folder', id: 'abc' });
  expect(parseKey('p:12')).toEqual({ type: 'podcast', id: '12' });
});
