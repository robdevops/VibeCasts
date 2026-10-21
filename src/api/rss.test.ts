import { sampleFeed } from './__fixtures__/feed.xml';
import { parseDuration, parseFeed, releaseSchedule } from './rss';

describe('parseFeed', () => {
  const feed = parseFeed(sampleFeed);

  it('reads show metadata', () => {
    expect(feed.podcast).toMatchObject({
      title: 'Sample Show',
      author: 'Sample Author',
      artwork: 'https://example.com/art.jpg',
      category: 'News',
      website: 'https://example.com',
      description: 'A show & more',
    });
  });

  it('keeps only episodes with audio, with guid fallback to audio url', () => {
    expect(feed.episodes.map((e) => e.id)).toEqual(['ep-3', 'ep-2', 'https://example.com/1.mp3']);
    expect(feed.episodes[0].durationSec).toBe(3723);
    expect(feed.episodes[0].published).toBe(Date.parse('2026-10-16T07:00:00Z'));
  });

  it('rejects non-RSS input', () => {
    expect(() => parseFeed('<html></html>')).toThrow();
  });
});

describe('parseDuration', () => {
  it.each([
    ['1:02:03', 3723],
    ['12:30', 750],
    ['1800', 1800],
    ['', 0],
    ['abc', 0],
  ])('%s -> %i', (raw, sec) => expect(parseDuration(raw)).toBe(sec));
});

describe('releaseSchedule', () => {
  const day = 86_400_000;
  it('detects weekly', () => {
    expect(releaseSchedule([0, 7, 14, 21].map((d) => d * day))).toBe('Weekly');
  });
  it('detects daily', () => {
    expect(releaseSchedule([0, 1, 2, 3, 4].map((d) => d * day))).toBe('Daily');
  });
  it('falls back to irregular with little data', () => {
    expect(releaseSchedule([1, 2].map((d) => d * day))).toBe('Irregular');
  });
});
