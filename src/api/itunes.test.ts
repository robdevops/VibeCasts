import { searchEpisodes, searchPodcasts, toPodcast, topPodcasts } from './itunes';

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

afterEach(() => jest.restoreAllMocks());

it('maps a podcast result, preferring the large artwork', () => {
  expect(
    toPodcast({
      collectionId: 7, collectionName: 'Show', artistName: 'Me', artworkUrl600: 'big', artworkUrl100: 'small',
      feedUrl: 'https://f', primaryGenreName: 'News',
    }),
  ).toMatchObject({ id: '7', title: 'Show', author: 'Me', artwork: 'big', feedUrl: 'https://f', category: 'News' });
});

it('drops search results that have no feed', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    json({ results: [{ collectionId: 1, collectionName: 'A', artistName: 'x', feedUrl: 'https://a' }, { collectionId: 2, collectionName: 'B', artistName: 'y' }] }) as Response,
  );
  expect((await searchPodcasts('q')).map((p) => p.id)).toEqual(['1']);
});

it('maps episode results and skips ones without audio', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    json({
      results: [
        { trackId: 9, collectionId: 1, trackName: 'Ep', episodeUrl: 'https://a.mp3', releaseDate: '2026-10-01T00:00:00Z', trackTimeMillis: 90_000 },
        { trackId: 10, collectionId: 1, trackName: 'No audio', releaseDate: '2026-10-01T00:00:00Z' },
      ],
    }) as Response,
  );
  const eps = await searchEpisodes('q');
  expect(eps).toHaveLength(1);
  expect(eps[0]).toMatchObject({ id: '9', podcastId: '1', durationSec: 90, audioUrl: 'https://a.mp3' });
});

it('resolves a genre chart through lookup, keeping chart order', async () => {
  const spy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(json({ feed: { entry: [{ id: { attributes: { 'im:id': '2' } } }, { id: { attributes: { 'im:id': '1' } } }] } }) as Response)
    .mockResolvedValueOnce(
      json({ results: [{ collectionId: 1, collectionName: 'A', artistName: 'x', feedUrl: 'https://a' }, { collectionId: 2, collectionName: 'B', artistName: 'y', feedUrl: 'https://b' }] }) as Response,
    );
  expect((await topPodcasts('us', 2, 1488)).map((p) => p.id)).toEqual(['2', '1']);
  expect(String(spy.mock.calls[0][0])).toContain('/genre=1488/');
});
