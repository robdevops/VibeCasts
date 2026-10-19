import { isFeedUrl, rssPodcastId } from './podcast-id';

it('recognises feed urls', () => {
  expect(isFeedUrl('https://feeds.example.com/show.xml')).toBe(true);
  expect(isFeedUrl('  http://example.com/rss  ')).toBe(true);
  expect(isFeedUrl('radio davos')).toBe(false);
  expect(isFeedUrl('ftp://example.com/a')).toBe(false);
  expect(isFeedUrl('https://nodots')).toBe(false);
});

it('derives stable, url-safe ids', () => {
  const id = rssPodcastId('https://Example.com/feed.xml/');
  expect(id).toBe(rssPodcastId('https://example.com/feed.xml'));
  expect(id).toMatch(/^rss-[0-9a-f]{8}$/);
  expect(rssPodcastId('https://example.com/other.xml')).not.toBe(id);
});
