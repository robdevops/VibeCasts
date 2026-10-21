import { sameList } from './same-list';

describe('sameList', () => {
  it('compares items in order', () => {
    expect(sameList(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameList(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameList(['a'], ['a', 'b'])).toBe(false);
    expect(sameList([], [])).toBe(true);
  });
});
