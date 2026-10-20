import { displayOrder } from './display-order';

const folders = { f1: ['a', 'b', 'c', 'd', 'e', 'f'], f2: ['x'] };

describe('displayOrder', () => {
  it('follows the tiles as displayed, not subscription order', () => {
    expect(displayOrder(['p:z', 'p:y', 'p:x2'], {})).toEqual(['z', 'y', 'x2']);
  });

  it('puts a folder\'s four mosaic images where the folder tile is, and the rest of its members last', () => {
    expect(displayOrder(['p:z', 'f:f1', 'p:y'], folders)).toEqual(['z', 'a', 'b', 'c', 'd', 'y', 'e', 'f']);
  });

  it('starts at the tile you scrolled to, then goes down, then wraps back to the top', () => {
    const keys = ['p:1', 'p:2', 'p:3', 'p:4', 'p:5', 'p:6'];
    expect(displayOrder(keys, {}, { from: 3, count: 2 })).toEqual(['4', '5', '6', '1', '2', '3']);
  });

  it('lists each podcast once and copes with unknown folders and empty input', () => {
    expect(displayOrder(['f:f2', 'p:x', 'f:nope'], folders)).toEqual(['x']);
    expect(displayOrder([], {})).toEqual([]);
  });
});
