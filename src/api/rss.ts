import { XMLParser } from 'fast-xml-parser';

import type { ParsedFeed } from './types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: true,
});

type Node = Record<string, unknown>;

const arr = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function text(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return text((v as Node)['#text']);
  return String(v).trim();
}

/** "1:02:03", "12:30", "1800" -> seconds. */
export function parseDuration(raw: unknown): number {
  const s = text(raw);
  if (!s) return 0;
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function parseFeed(xml: string): ParsedFeed {
  const channel = (parser.parse(xml) as { rss?: { channel?: Node } }).rss?.channel;
  if (!channel) throw new Error('Not an RSS feed');
  const image = channel['itunes:image'] as Node | undefined;
  const categories = arr(channel['itunes:category'] as Node | Node[] | undefined);
  const link = text(channel.link);

  const episodes = arr(channel.item as Node | Node[] | undefined).flatMap((item) => {
    const enclosure = item.enclosure as Node | undefined;
    const audioUrl = enclosure ? text(enclosure['@_url']) : '';
    if (!audioUrl) return [];
    const itemImage = item['itunes:image'] as Node | undefined;
    const transcript = arr(item['podcast:transcript'] as Node | Node[] | undefined)[0];
    const published = Date.parse(text(item.pubDate));
    const length = Number(text(enclosure?.['@_length']));
    return [
      {
        id: text(item.guid) || audioUrl,
        title: text(item.title),
        description: text(item['content:encoded']) || text(item.description) || text(item['itunes:summary']),
        audioUrl,
        published: Number.isNaN(published) ? 0 : published,
        durationSec: parseDuration(item['itunes:duration']),
        artwork: itemImage ? text(itemImage['@_href']) || undefined : undefined,
        transcriptUrl: transcript ? text(transcript['@_url']) || undefined : undefined,
        // Many feeds put 0 or 1 here; only believe a plausible size.
        sizeBytes: length > 100_000 ? length : undefined,
      },
    ];
  });

  return {
    podcast: {
      title: text(channel.title),
      author: text(channel['itunes:author']) || text(channel.managingEditor),
      artwork: (image && text(image['@_href'])) || text((channel.image as Node | undefined)?.url),
      category: categories[0] ? text(categories[0]['@_text']) : undefined,
      description: text(channel['itunes:summary']) || text(channel.description),
      website: link || undefined,
    },
    episodes,
  };
}

/** Infer "Weekly", "Daily", ... from the gaps between the latest episodes. */
export function releaseSchedule(published: number[]): string {
  const dates = [...published].filter(Boolean).sort((a, b) => b - a).slice(0, 8);
  if (dates.length < 3) return 'Irregular';
  const gaps = dates.slice(1).map((d, i) => (dates[i] - d) / 86_400_000).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (median <= 1.5) return 'Daily';
  if (median <= 4) return 'Several times a week';
  if (median <= 9) return 'Weekly';
  if (median <= 17) return 'Every two weeks';
  if (median <= 40) return 'Monthly';
  return 'Irregular';
}
