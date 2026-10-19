export type Podcast = {
  /** iTunes collection id as a string, or the feed URL for RSS-only shows. */
  id: string;
  title: string;
  author: string;
  artwork: string;
  feedUrl: string;
  category?: string;
  description?: string;
  website?: string;
  rating?: number;
  ratingCount?: number;
  /** Added from an OPML file with only a title and feed URL: artwork and details are still to be filled in. */
  needsMeta?: boolean;
};

export type Episode = {
  /** Stable key: the RSS guid, falling back to the audio URL. */
  id: string;
  podcastId: string;
  title: string;
  description: string;
  audioUrl: string;
  /** Publish time, epoch ms. */
  published: number;
  durationSec: number;
  artwork?: string;
  transcriptUrl?: string;
};

export type ParsedFeed = {
  podcast: Omit<Podcast, 'id' | 'feedUrl'>;
  episodes: Omit<Episode, 'podcastId'>[];
};
