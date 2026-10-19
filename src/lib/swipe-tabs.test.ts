import { nextTab } from './swipe-tabs';

const tabs = ['playing', 'details', 'bookmarks'] as const;

describe('nextTab', () => {
  it('swiping left goes to the next tab, right to the previous', () => {
    expect(nextTab(tabs, 'playing', -120, 0)).toBe('details');
    expect(nextTab(tabs, 'details', -120, 0)).toBe('bookmarks');
    expect(nextTab(tabs, 'bookmarks', 120, 0)).toBe('details');
    expect(nextTab(tabs, 'details', 120, 0)).toBe('playing');
  });

  it('stays put at either end', () => {
    expect(nextTab(tabs, 'bookmarks', -200, -900)).toBeNull();
    expect(nextTab(tabs, 'playing', 200, 900)).toBeNull();
  });

  it('ignores short, slow swipes but accepts a quick flick', () => {
    expect(nextTab(tabs, 'playing', -30, -100)).toBeNull();
    expect(nextTab(tabs, 'playing', -40, -900)).toBe('details');
    expect(nextTab(tabs, 'playing', -40, 900)).toBeNull(); // finger came back
  });

  it('works with two tabs (a show that is not playing)', () => {
    expect(nextTab(['details', 'bookmarks'] as const, 'details', -100, 0)).toBe('bookmarks');
    expect(nextTab(['details', 'bookmarks'] as const, 'bookmarks', -100, 0)).toBeNull();
  });

  it('returns null for an unknown current tab', () => {
    expect(nextTab(['details'] as const, 'playing' as never, -100, 0)).toBeNull();
  });
});
