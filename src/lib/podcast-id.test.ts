import { feedCandidates, hostLabel, isFeedUrl, rssPodcastId, splitCredentials, toFeedUrl } from './podcast-id';

describe('toFeedUrl', () => {
  it.each([
    ['https://feeds.example.com/show.xml', 'https://feeds.example.com/show.xml'],
    ['  http://example.com/rss  \n', 'http://example.com/rss'],
    // Private subscriber links keep their tokens exactly, including case.
    ['https://rss.example.org/feed/80C38624-5894-47b7?token=AbC123&x=1', 'https://rss.example.org/feed/80C38624-5894-47b7?token=AbC123&x=1'],
    ['https://podcast.example.com:443/podcasts/a/feed/?token=55164EE8', 'https://podcast.example.com:443/podcasts/a/feed/?token=55164EE8'],
    ['http://192.168.1.20:8080/feed', 'http://192.168.1.20:8080/feed'],
    ['https://nas/podcast.xml', 'https://nas/podcast.xml'],
    ['http://localhost:3000/rss', 'http://localhost:3000/rss'],
    ['HTTPS://Example.com/a', 'HTTPS://Example.com/a'],
    ['https://user:p%40ss@example.com/private.xml', 'https://user:p%40ss@example.com/private.xml'],
  ])('accepts %s', (input, out) => expect(toFeedUrl(input)).toBe(out));

  it.each([
    ['feed://example.com/rss', 'http://example.com/rss'],
    ['pcast://example.com/rss', 'http://example.com/rss'],
    ['itpc://example.com/rss', 'http://example.com/rss'],
    ['feed:https://example.com/rss', 'https://example.com/rss'],
  ])('maps the podcast scheme in %s', (input, out) => expect(toFeedUrl(input)).toBe(out));

  it.each(['', '   ', 'radio davos', 'ftp://example.com/a', 'example.com/feed.xml', 'https://', 'https://exa mple.com', 'mailto:a@b.c'])(
    'rejects %j',
    (input) => expect(toFeedUrl(input)).toBeNull(),
  );

  it('isFeedUrl agrees', () => {
    expect(isFeedUrl('https://nas/podcast.xml')).toBe(true);
    expect(isFeedUrl('radio davos')).toBe(false);
  });
});

describe('splitCredentials', () => {
  it('moves user:pass into a Basic header and strips it from the URL', () => {
    const r = splitCredentials('https://user:p%40ss@example.com/private.xml?x=1');
    expect(r.url).toBe('https://example.com/private.xml?x=1');
    expect(r.authorization).toBe(`Basic ${btoa('user:p@ss')}`);
  });
  it('leaves normal URLs alone', () => {
    expect(splitCredentials('https://example.com/a?token=Z')).toEqual({ url: 'https://example.com/a?token=Z' });
  });
});

describe('rssPodcastId', () => {
  it('is stable and url-safe', () => {
    const id = rssPodcastId('https://Example.com/feed.xml/');
    expect(id).toBe(rssPodcastId('https://example.com/feed.xml'));
    expect(id).toMatch(/^rss-[0-9a-f]{8}$/);
    expect(rssPodcastId('https://example.com/other.xml')).not.toBe(id);
  });
  it('keeps case-sensitive tokens distinct', () => {
    expect(rssPodcastId('https://example.com/f?token=AbC')).not.toBe(rssPodcastId('https://example.com/f?token=abc'));
    expect(rssPodcastId('https://example.com/Private/Feed')).not.toBe(rssPodcastId('https://example.com/private/feed'));
  });
});

describe('hostLabel', () => {
  it('shows only the domain', () => {
    expect(hostLabel('https://www.example.com/path/to?token=secret')).toBe('example.com');
    expect(hostLabel('http://feeds.example.org:8080/x')).toBe('feeds.example.org');
    expect(hostLabel('not a url/with path')).toBe('not a url');
  });
});

describe('feedCandidates', () => {
  it('tries https before http, and leaves https alone', () => {
    expect(feedCandidates('http://a.example/f?t=Ab')).toEqual(['https://a.example/f?t=Ab', 'http://a.example/f?t=Ab']);
    expect(feedCandidates('https://a.example/f')).toEqual(['https://a.example/f']);
  });
});
