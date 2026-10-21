import { referenceOpml as reference } from './__fixtures__/reference-opml';
import { buildOpml, normalizeFeedUrl, OpmlError, parseOpml } from './opml';

describe('parseOpml: the Pocket Casts reference export', () => {
  const r = parseOpml(reference);

  it('reads every feed from the single "feeds" wrapper, without making it a folder', () => {
    expect(r.title).toBe('Pocket Casts Feeds');
    expect(r.feeds).toHaveLength(30);
    expect(r.feeds.every((f) => f.folder === undefined)).toBe(true);
    expect(r.skipped).toBe(0);
  });

  it('decodes entities in titles', () => {
    expect(r.feeds.some((f) => f.title.includes('&') && !f.title.includes('&amp;'))).toBe(true);
  });

  it('keeps plain http feeds as given', () => {
    expect(r.feeds.some((f) => f.feedUrl.startsWith('http://'))).toBe(true);
  });
});

describe('parseOpml: other shapes', () => {
  const wrap = (body: string, head = '<head><title>T</title></head>') => `<?xml version="1.0"?><opml version="2.0">${head}<body>${body}</body></opml>`;

  it('turns named containers into folders and keeps top-level feeds loose', () => {
    const r = parseOpml(
      wrap(`
        <outline text="Loose" type="rss" xmlUrl="https://a.example/rss"/>
        <outline text="News"><outline text="N1" xmlUrl="https://n1.example/rss"/><outline text="N2" xmlUrl="https://n2.example/rss"/></outline>
        <outline text="Study"><outline text="S1" xmlUrl="https://s1.example/rss"/></outline>`),
    );
    expect(r.feeds.map((f) => [f.title, f.folder])).toEqual([
      ['Loose', undefined],
      ['N1', 'News'],
      ['N2', 'News'],
      ['S1', 'Study'],
    ]);
  });

  it('handles a wrapper that itself contains folders', () => {
    const r = parseOpml(wrap(`<outline text="feeds"><outline text="News"><outline text="N1" xmlUrl="https://n1.example/rss"/></outline></outline>`));
    expect(r.feeds).toEqual([{ title: 'N1', feedUrl: 'https://n1.example/rss', folder: 'News' }]);
  });

  it('accepts different attribute casing, url=, title= and htmlUrl', () => {
    const r = parseOpml(wrap(`<outline type="rss" title="T1" XMLURL="https://a.example/1"/><outline text="T2" url="https://a.example/2" htmlUrl="https://site.example"/>`));
    expect(r.feeds.map((f) => f.title)).toEqual(['T1', 'T2']);
    expect(r.feeds[1].htmlUrl).toBe('https://site.example');
  });

  it('keeps private tokenised URLs exactly, with query strings', () => {
    const url = 'https://rss.example.org/feed/80C38624?token=SeCrEt&x=1';
    expect(parseOpml(wrap(`<outline text="P" xmlUrl="${url.replace(/&/g, '&amp;')}"/>`)).feeds[0].feedUrl).toBe(url);
  });

  it('counts outlines with unusable URLs as skipped and drops duplicates', () => {
    const r = parseOpml(
      wrap(`<outline text="A" xmlUrl="https://a.example/rss"/><outline text="A again" xmlUrl="https://a.example/rss"/><outline text="Bad" type="rss" xmlUrl="not a url"/><outline text="Empty" type="rss"/>`),
    );
    expect(r.feeds).toHaveLength(1);
    expect(r.skipped).toBe(2);
  });

  it('tolerates a BOM and a missing head', () => {
    const r = parseOpml('﻿<opml version="1.0"><body><outline text="A" xmlUrl="https://a.example/rss"/></body></opml>');
    expect(r.title).toBe('');
    expect(r.feeds).toHaveLength(1);
  });

  it.each([
    ['<html><body>hi</body></html>', /isn't an OPML/],
    ['not xml at all', /isn't an OPML|valid OPML/],
    ['<opml version="1.0"><body></body></opml>', /No podcasts/],
  ])('rejects %j with a clear message', (xml, msg) => {
    const run = () => parseOpml(xml);
    expect(run).toThrow(OpmlError);
    expect(run).toThrow(msg);
  });
});

describe('buildOpml', () => {
  const podcasts = [
    { id: '1', title: 'Arts & Ideas', feedUrl: 'https://a.example/rss?x=1&y=2', website: 'https://a.example' },
    { id: '2', title: 'Radio "Davos"', feedUrl: 'https://b.example/rss', folderId: 'f1' },
    { id: '3', title: "Dan's Show", feedUrl: 'https://c.example/rss', folderId: 'f1' },
    { id: '4', title: 'Lonely', feedUrl: 'https://d.example/rss', folderId: 'gone' },
  ];
  const folders = { f1: { id: 'f1', name: 'News & Views' } };
  const xml = buildOpml({ podcasts, folders, now: new Date('2026-10-19T00:00:00Z') });

  it('is OPML 2.0 with a creation date', () => {
    expect(xml).toContain('<opml version="2.0">');
    expect(xml).toContain('<dateCreated>Mon, 19 Oct 2026 00:00:00 GMT</dateCreated>');
  });

  it('escapes attribute values', () => {
    expect(xml).toContain('text="Arts &amp; Ideas"');
    expect(xml).toContain('xmlUrl="https://a.example/rss?x=1&amp;y=2"');
    expect(xml).toContain('text="Radio &quot;Davos&quot;"');
    expect(xml).toContain('text="Dan&apos;s Show"');
  });

  it('nests folder members and lists others (including orphans of deleted folders) at the top', () => {
    const parsed = parseOpml(xml);
    expect(parsed.feeds.map((f) => [f.title, f.folder])).toEqual([
      ['Arts & Ideas', undefined],
      ['Lonely', undefined],
      ['Radio "Davos"', 'News & Views'],
      ["Dan's Show", 'News & Views'],
    ]);
  });

  it('omits empty folders', () => {
    const out = buildOpml({ podcasts: [podcasts[0]], folders: { f1: folders.f1 } });
    expect(out).not.toContain('News &amp; Views');
  });
});

describe('round trip', () => {
  it('exporting what was imported gives the same feeds', () => {
    const imported = parseOpml(reference);
    const exported = buildOpml({
      podcasts: imported.feeds.map((f, i) => ({ id: String(i), title: f.title, feedUrl: f.feedUrl })),
      folders: {},
    });
    const again = parseOpml(exported);
    expect(again.feeds.map((f) => [f.title, f.feedUrl])).toEqual(imported.feeds.map((f) => [f.title, f.feedUrl]));
  });

  it('keeps folders through a round trip', () => {
    const before = parseOpml(
      `<opml version="2.0"><body><outline text="News"><outline text="N1" xmlUrl="https://n1.example/rss"/></outline><outline text="L" xmlUrl="https://l.example/rss"/></body></opml>`,
    );
    const folders = { f: { id: 'f', name: 'News' } };
    const out = buildOpml({
      podcasts: before.feeds.map((f, i) => ({ id: String(i), title: f.title, feedUrl: f.feedUrl, folderId: f.folder ? 'f' : undefined })),
      folders,
    });
    expect(parseOpml(out).feeds.map((f) => [f.title, f.folder])).toEqual([['L', undefined], ['N1', 'News']]);
  });
});

describe('normalizeFeedUrl', () => {
  it('treats http and https, host case and trailing slashes as the same', () => {
    const k = normalizeFeedUrl('https://Feeds.Example.com/show/');
    expect(normalizeFeedUrl('http://feeds.example.com/show')).toBe(k);
    expect(normalizeFeedUrl('https://feeds.example.com/show#frag')).toBe(k);
  });
  it('keeps path and query case-sensitive (tokens)', () => {
    expect(normalizeFeedUrl('https://a.example/f?token=AbC')).not.toBe(normalizeFeedUrl('https://a.example/f?token=abc'));
    expect(normalizeFeedUrl('https://a.example/Show')).not.toBe(normalizeFeedUrl('https://a.example/show'));
  });
});
