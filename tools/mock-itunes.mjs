// Playwright route mocks for the iTunes endpoints (the sandbox can't reach Apple).
const SHOWS = [
  ['1', 'The Most Important Question', 'Important, Not Important'],
  ['2', 'Reaching Out', 'Futuro Media'],
  ['3', 'Heist at the Louvre', 'ABC News'],
  ['4', 'Machine Gods', 'NPR'],
  ['5', "History's Greatest Mysteries", 'The HISTORY Channel'],
  ['6', 'Radio Davos', 'World Economic Forum'],
  ['7', 'The Perfect Scam', 'iHeartPodcasts'],
].map(([id, name, artist], i) => ({
  collectionId: Number(id), collectionName: name, artistName: artist, feedUrl: `https://example.com/${id}.xml`, primaryGenreName: 'News',
  artworkUrl600: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="${['#5B1F1F', '#2E86C1', '#27AE60', '#8E44AD', '#D68910', '#16A085', '#C0392B'][i]}"/><text x="150" y="160" font-size="26" font-family="sans-serif" font-weight="700" fill="white" text-anchor="middle">${name.split(' ').slice(0, 2).join(' ')}</text></svg>`),
}));

export async function mockItunes(page) {
  await page.route('https://itunes.apple.com/**', async (route) => {
    const url = route.request().url();
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (url.includes('/rss/toppodcasts')) return json({ feed: { entry: SHOWS.map((s) => ({ id: { attributes: { 'im:id': String(s.collectionId) } } })) } });
    if (url.includes('/lookup')) return json({ results: SHOWS });
    if (url.includes('entity=podcastEpisode'))
      return json({ results: SHOWS.slice(0, 4).map((s, i) => ({ trackId: 900 + i, collectionId: s.collectionId, trackName: `${s.collectionName}: episode ${i + 1}`, episodeUrl: 'https://example.com/a.mp3', releaseDate: '2026-10-1' + i + 'T00:00:00Z', trackTimeMillis: 1_800_000, artworkUrl160: s.artworkUrl600 })) });
    return json({ results: SHOWS.filter((s) => /./.test(s.collectionName)) });
  });
}

const FEED = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Mock Show</title><link>https://example.com</link><description>Mock</description><itunes:author>Someone</itunes:author><itunes:image href=""/><itunes:category text="News"/>${[0, 1, 2, 3, 4, 5].map((i) => `<item><title>Mock episode ${i}</title><guid>m${i}</guid><pubDate>${new Date(1_760_000_000_000 - i * 7 * 86400000).toUTCString()}</pubDate><enclosure url="https://example.com/${i}.mp3" type="audio/mpeg" length="1"/><itunes:duration>${20 + i}:00</itunes:duration><description>Notes ${i}</description></item>`).join('')}</channel></rss>`;

/** The web build fetches feeds through /api/feed; answer it without touching the network. */
export async function mockFeedProxy(page) {
  await page.route('**/api/feed?**', (route) => route.fulfill({ status: 200, contentType: 'application/xml', body: FEED }));
}
