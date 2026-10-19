import { Platform } from 'react-native';

import type { Episode, Podcast } from './types';

const BASE = 'https://itunes.apple.com';

/** Web can't fetch most feeds (CORS), so route them through our API route. */
export const feedFetchUrl = (feedUrl: string) =>
  Platform.OS === 'web' ? `/api/feed?url=${encodeURIComponent(feedUrl)}` : feedUrl;

type ItunesPodcast = {
  collectionId: number;
  collectionName: string;
  artistName: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  feedUrl?: string;
  primaryGenreName?: string;
  collectionViewUrl?: string;
};

type ItunesEpisode = {
  trackId: number;
  collectionId: number;
  trackName: string;
  description?: string;
  episodeUrl?: string;
  releaseDate: string;
  trackTimeMillis?: number;
  artworkUrl160?: string;
};

export const toPodcast = (r: ItunesPodcast): Podcast => ({
  id: String(r.collectionId),
  title: r.collectionName,
  author: r.artistName,
  artwork: r.artworkUrl600 ?? r.artworkUrl100 ?? '',
  feedUrl: r.feedUrl ?? '',
  category: r.primaryGenreName,
  website: r.collectionViewUrl,
});

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

export async function searchPodcasts(term: string, limit = 25): Promise<Podcast[]> {
  const q = encodeURIComponent(term);
  const data = await getJson<{ results: ItunesPodcast[] }>(
    `${BASE}/search?media=podcast&entity=podcast&limit=${limit}&term=${q}`,
  );
  return data.results.filter((r) => r.feedUrl).map(toPodcast);
}

export async function searchEpisodes(term: string, limit = 25): Promise<Episode[]> {
  const q = encodeURIComponent(term);
  const data = await getJson<{ results: ItunesEpisode[] }>(
    `${BASE}/search?media=podcast&entity=podcastEpisode&limit=${limit}&term=${q}`,
  );
  return data.results
    .filter((r) => r.episodeUrl)
    .map((r) => ({
      id: String(r.trackId),
      podcastId: String(r.collectionId),
      title: r.trackName,
      description: r.description ?? '',
      audioUrl: r.episodeUrl as string,
      published: Date.parse(r.releaseDate) || 0,
      durationSec: Math.round((r.trackTimeMillis ?? 0) / 1000),
      artwork: r.artworkUrl160,
    }));
}

/** Top podcasts chart, resolved to full podcast records (with feed URLs) via lookup. */
export async function topPodcasts(country = 'us', limit = 20, genreId?: number): Promise<Podcast[]> {
  const genre = genreId ? `/genre=${genreId}` : '';
  const chart = await getJson<{
    feed: { entry?: { id: { attributes: { 'im:id': string } } }[] };
  }>(`${BASE}/${country}/rss/toppodcasts/limit=${limit}${genre}/json`);
  const ids = (chart.feed.entry ?? []).map((e) => e.id.attributes['im:id']);
  if (!ids.length) return [];
  const data = await getJson<{ results: ItunesPodcast[] }>(`${BASE}/lookup?id=${ids.join(',')}`);
  const byId = new Map(data.results.map((r) => [String(r.collectionId), r]));
  return ids.flatMap((id) => (byId.get(id)?.feedUrl ? [toPodcast(byId.get(id) as ItunesPodcast)] : []));
}

export async function lookupPodcast(id: string): Promise<Podcast | null> {
  const data = await getJson<{ results: ItunesPodcast[] }>(`${BASE}/lookup?id=${id}`);
  return data.results[0] ? toPodcast(data.results[0]) : null;
}

/** iTunes podcast genre ids used for the Discovery category chips. */
export const GENRES: { id: number; name: string }[] = [
  { id: 1488, name: 'True Crime' },
  { id: 1303, name: 'Comedy' },
  { id: 1489, name: 'News' },
  { id: 1324, name: 'Society & Culture' },
  { id: 1321, name: 'Business' },
  { id: 1318, name: 'Technology' },
  { id: 1512, name: 'Health & Fitness' },
  { id: 1304, name: 'Education' },
  { id: 1487, name: 'History' },
  { id: 1533, name: 'Science' },
  { id: 1545, name: 'Sports' },
  { id: 1309, name: 'TV & Film' },
  { id: 1301, name: 'Arts' },
  { id: 1310, name: 'Music' },
  { id: 1305, name: 'Kids & Family' },
  { id: 1483, name: 'Fiction' },
];
