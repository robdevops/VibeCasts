import { matchesWordStart, searchPodcasts } from './search';

describe('matchesWordStart', () => {
  it('matches at the start of a word, not inside one', () => {
    expect(matchesWordStart('Metaverse Weekly', 'me')).toBe(true);
    expect(matchesWordStart('The Medical Hour', 'me')).toBe(true);
    expect(matchesWordStart('Games and Junk', 'me')).toBe(false);
    expect(matchesWordStart('Homeless', 'me')).toBe(false);
  });

  it('works across words and ignores case, accents and extra spaces', () => {
    expect(matchesWordStart('The Daily Brief', 'the dai')).toBe(true);
    expect(matchesWordStart('The Daily Brief', 'daily b')).toBe(true);
    expect(matchesWordStart('The Daily Brief', 'aily')).toBe(false);
    expect(matchesWordStart('The Daily Brief', '  DAILY   brief ')).toBe(true);
    expect(matchesWordStart('Café Society', 'cafe')).toBe(true);
    expect(matchesWordStart('Zoë', 'zoe')).toBe(true);
  });

  it('treats punctuation as a word boundary', () => {
    expect(matchesWordStart('R&D Weekly', 'd')).toBe(true);
    expect(matchesWordStart('Rock-n-Roll', 'roll')).toBe(true);
    expect(matchesWordStart('Rock-n-Roll', 'ock')).toBe(false);
  });

  it('an empty query matches everything', () => {
    expect(matchesWordStart('Anything', '')).toBe(true);
    expect(matchesWordStart('Anything', '   ')).toBe(true);
  });

  it('handles other scripts', () => {
    expect(matchesWordStart('Подкаст про технологии', 'тех')).toBe(true);
    expect(matchesWordStart('Подкаст про технологии', 'хно')).toBe(false);
  });
});

describe('searchPodcasts', () => {
  const list = [
    { id: '1', title: 'Games and Junk', author: 'Meg' },
    { id: '2', title: 'Metaverse Weekly', author: 'Zed' },
    { id: '3', title: 'Mediterranean Cooking', author: 'Ann' },
    { id: '4', title: 'Zebra Facts', author: 'Media Corp' },
  ];

  it('finds title word starts first, then author-only matches, alphabetically', () => {
    expect(searchPodcasts(list, 'me')).toEqual(['3', '2', '1', '4']);
  });

  it('does not match inside a word', () => {
    expect(searchPodcasts(list, 'ames')).toEqual([]);
  });
});
