import { XMLParser } from 'fast-xml-parser';

import { toFeedUrl } from './podcast-id';

export type OpmlFeed = {
  title: string;
  feedUrl: string;
  htmlUrl?: string;
  /** Name of the folder (container outline) the feed was in, if any. */
  folder?: string;
};

export type ParsedOpml = {
  title: string;
  feeds: OpmlFeed[];
  /** Outlines that looked like feeds but had no usable http(s) address. */
  skipped: number;
};

export class OpmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpmlError';
  }
}

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: true,
  // Lowercase every name so xmlUrl / xmlurl / XMLURL are all the same attribute.
  transformAttributeName: (name) => name.toLowerCase(),
  transformTagName: (name) => name.toLowerCase(),
  isArray: (name) => name === 'outline',
});

const attr = (n: Node, name: string): string => {
  const v = n[`@_${name}`];
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
};

/** Container names that just wrap the whole list rather than naming a folder. */
const WRAPPER_NAMES = new Set(['feeds', 'subscriptions', 'subscription', 'podcasts', 'podcast', 'all', 'all feeds', 'opml']);

/**
 * Read an OPML podcast list. Accepts the flat lists most apps export (Pocket Casts wraps
 * everything in one "feeds" outline) and nested folders. A generic top-level wrapper is unwrapped;
 * any other container becomes a folder.
 */
export function parseOpml(xml: string): ParsedOpml {
  const text = xml.replace(/^﻿/, '');
  let doc: Node;
  try {
    doc = parser.parse(text) as Node;
  } catch {
    throw new OpmlError("That file isn't valid OPML.");
  }
  const opml = doc.opml as Node | undefined;
  if (!opml || typeof opml !== 'object') throw new OpmlError("That file isn't an OPML podcast list.");

  const head = opml.head as Node | undefined;
  const title = head && typeof head.title === 'string' ? head.title.trim() : '';
  const body = opml.body as Node | undefined;
  const top = (body?.outline as Node[] | undefined) ?? [];

  const feeds: OpmlFeed[] = [];
  let skipped = 0;
  const seen = new Set<string>();

  const visit = (node: Node, folder: string | undefined, depth: number) => {
    const children = (node.outline as Node[] | undefined) ?? [];
    const label = attr(node, 'text') || attr(node, 'title');
    const rawUrl = attr(node, 'xmlurl') || attr(node, 'url');

    if (rawUrl || attr(node, 'type').toLowerCase() === 'rss') {
      const url = toFeedUrl(rawUrl);
      if (!url) {
        skipped++;
      } else if (!seen.has(url)) {
        seen.add(url);
        feeds.push({
          title: label || attr(node, 'title') || url,
          feedUrl: url,
          ...(attr(node, 'htmlurl') ? { htmlUrl: attr(node, 'htmlurl') } : null),
          ...(folder ? { folder } : null),
        });
      }
    }

    if (children.length) {
      // A generic wrapper at the top is not a folder; deeper named containers are.
      const isWrapper = depth === 0 && WRAPPER_NAMES.has(label.toLowerCase());
      const next = isWrapper || !label || rawUrl ? folder : label;
      for (const c of children) visit(c, next, depth + 1);
    }
  };

  for (const n of top) visit(n, undefined, 0);

  if (!feeds.length && !skipped) throw new OpmlError('No podcasts were found in that file.');
  return { title, feeds, skipped };
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export type OpmlSource = {
  /** Podcasts in display order. */
  podcasts: { id: string; title: string; feedUrl: string; website?: string; folderId?: string }[];
  folders: Record<string, { id: string; name: string }>;
  /** Folder display order (folder ids). */
  folderOrder?: string[];
  now?: Date;
};

/**
 * Write an OPML 2.0 file: shows that live in a folder are nested inside an outline named after it,
 * everything else is listed at the top level. Other apps that ignore nesting still see every feed.
 */
export function buildOpml({ podcasts, folders, folderOrder, now = new Date() }: OpmlSource): string {
  const line = (p: OpmlSource['podcasts'][number], indent: string) =>
    `${indent}<outline type="rss" text="${esc(p.title)}" title="${esc(p.title)}" xmlUrl="${esc(p.feedUrl)}"${
      p.website ? ` htmlUrl="${esc(p.website)}"` : ''
    } />`;

  const rows: string[] = [];
  for (const p of podcasts) if (!p.folderId || !folders[p.folderId]) rows.push(line(p, '    '));

  const ids = [...(folderOrder ?? []), ...Object.keys(folders).filter((id) => !(folderOrder ?? []).includes(id))];
  for (const id of ids) {
    const folder = folders[id];
    if (!folder) continue;
    const inside = podcasts.filter((p) => p.folderId === id);
    if (!inside.length) continue;
    rows.push(`    <outline text="${esc(folder.name)}" title="${esc(folder.name)}">`);
    for (const p of inside) rows.push(line(p, '      '));
    rows.push('    </outline>');
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Podcast subscriptions</title>
    <dateCreated>${now.toUTCString()}</dateCreated>
  </head>
  <body>
${rows.join('\n')}
  </body>
</opml>
`;
}

/**
 * Key for "is this the same feed?": http and https are the same, host case and a trailing slash or
 * fragment don't matter. Path and query (which can hold private tokens) are compared exactly.
 */
export function normalizeFeedUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return url.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }
}
