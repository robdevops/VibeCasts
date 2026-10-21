import { createMemoryKV } from '@/db/storage';

import { createLibraryStore, episodeKey } from './library';

const pod = (id: string) => ({ id, title: `P${id}`, author: 'A', artwork: '', feedUrl: `https://f/${id}` });

jest.mock('@/db/kv', () => ({ kv: {} }));

describe('library store', () => {
  it('subscribes, groups into folders and ungroups', () => {
    const s = createLibraryStore(createMemoryKV());
    s.getState().subscribe(pod('1'));
    s.getState().subscribe(pod('2'));
    s.getState().subscribe(pod('1')); // idempotent
    expect(s.getState().homeOrder).toEqual(['p:1', 'p:2']);

    const f = s.getState().createFolder('News', '#fff');
    s.getState().moveToFolder('1', f);
    expect(s.getState().homeOrder).toEqual([`f:${f}`, 'p:2']);
    expect(s.getState().folderOrder[f]).toEqual(['1']);

    s.getState().removeFromFolder('1'); // the last show: the folder goes with it
    expect(s.getState().homeOrder).toEqual(['p:2', 'p:1']);
    expect(s.getState().folders[f]).toBeUndefined();
    expect(s.getState().subscriptions['1'].folderId).toBeUndefined();
  });

  it('deleting a folder releases its members in place', () => {
    const s = createLibraryStore(createMemoryKV());
    s.getState().subscribe(pod('1'));
    const f = s.getState().createFolder('X', '#000');
    s.getState().moveToFolder('1', f);
    s.getState().deleteFolder(f);
    expect(s.getState().homeOrder).toEqual(['p:1']);
    expect(s.getState().folders).toEqual({});
  });

  it('unsubscribing removes it from its folder', () => {
    const s = createLibraryStore(createMemoryKV());
    s.getState().subscribe(pod('1'));
    const f = s.getState().createFolder('X', '#000');
    s.getState().moveToFolder('1', f);
    s.getState().subscribe(pod('2'));
    s.getState().moveToFolder('2', f);
    s.getState().unsubscribe('1');
    expect(s.getState().folderOrder[f]).toEqual(['2']);
  });

  it('tracks episode state and persists across hydrate', async () => {
    jest.useFakeTimers();
    const storage = createMemoryKV();
    const a = createLibraryStore(storage);
    await a.getState().hydrate();
    a.getState().subscribe(pod('1'));
    a.getState().patchEpisode(episodeKey('1', 'e1'), { progressMs: 5000 });
    jest.advanceTimersByTime(500);
    jest.useRealTimers();
    await Promise.resolve();

    const b = createLibraryStore(storage);
    await b.getState().hydrate();
    expect(b.getState().episodes['1|e1'].progressMs).toBe(5000);
    expect(b.getState().subscriptions['1']).toBeDefined();
  });
});

it('patches several episodes at once without touching others', () => {
  const s = createLibraryStore(createMemoryKV());
  s.getState().patchEpisode(episodeKey('1', 'keep'), { starred: true });
  s.getState().patchEpisodes('1', ['a', 'b'], { played: true, progressMs: 0 });
  expect(s.getState().episodes['1|a']).toMatchObject({ played: true });
  expect(s.getState().episodes['1|b']).toMatchObject({ played: true });
  expect(s.getState().episodes['1|keep']).toMatchObject({ starred: true, played: false });
});

describe('OPML import', () => {
  const feed = (url: string, title = url, folder?: string) => ({ title, feedUrl: url, folder });

  it('subscribes new feeds, files them in folders and skips ones already present', () => {
    const s = createLibraryStore(createMemoryKV());
    s.getState().subscribe(pod('1')); // https://f/1
    const r = s.getState().importFeeds([
      feed('http://f/1', 'Same show over http'),
      feed('https://a.example/rss', 'A'),
      feed('https://b.example/rss', 'B', 'News'),
      feed('https://c.example/rss', 'C', 'news'),
    ]);
    expect(r).toEqual({ added: 3, existing: 1, folders: 1 });
    const { subscriptions, folders, folderOrder, homeOrder } = s.getState();
    expect(Object.keys(subscriptions)).toHaveLength(4);
    const news = Object.values(folders)[0];
    expect(news.name).toBe('News');
    expect(folderOrder[news.id]).toHaveLength(2);
    expect(homeOrder).toHaveLength(3); // pod 1, A, the folder
    expect(Object.values(subscriptions).filter((x) => x.podcast.needsMeta)).toHaveLength(3);
  });

  it('is idempotent', () => {
    const s = createLibraryStore(createMemoryKV());
    const list = [feed('https://a.example/rss'), feed('https://b.example/rss', 'B', 'X')];
    s.getState().importFeeds(list);
    const again = s.getState().importFeeds(list);
    expect(again).toEqual({ added: 0, existing: 2, folders: 0 });
    expect(s.getState().homeOrder).toHaveLength(2);
  });

  it('subscribe ignores a show whose feed is already imported', () => {
    const s = createLibraryStore(createMemoryKV());
    s.getState().importFeeds([feed('https://f/9', 'Nine')]);
    s.getState().subscribe({ ...pod('999'), feedUrl: 'http://F/9' });
    expect(Object.keys(s.getState().subscriptions)).toHaveLength(1);
  });

  it('fills in details from the feed once, then clears needsMeta', () => {
    const s = createLibraryStore(createMemoryKV());
    s.getState().importFeeds([feed('https://a.example/rss', 'From file')]);
    const id = Object.keys(s.getState().subscriptions)[0];
    s.getState().mergePodcastMeta(id, { title: 'Real title', author: 'Au', artwork: 'https://art/x.jpg', category: 'News' });
    expect(s.getState().subscriptions[id].podcast).toMatchObject({ title: 'Real title', author: 'Au', artwork: 'https://art/x.jpg', needsMeta: false });
    s.getState().mergePodcastMeta(id, { title: 'Renamed later' });
    expect(s.getState().subscriptions[id].podcast.title).toBe('Real title');
  });
});

describe('countsVersion (unplayed counts only need to refresh when played/archived changes)', () => {
  it('ignores progress saves but not played or archived changes', () => {
    const s = createLibraryStore(createMemoryKV());
    const v0 = s.getState().countsVersion;
    s.getState().patchEpisode('1|a', { progressMs: 12_000, lastPlayed: 5 });
    s.getState().patchEpisode('1|a', { progressMs: 20_000 });
    expect(s.getState().countsVersion).toBe(v0);
    s.getState().patchEpisode('1|a', { played: true });
    expect(s.getState().countsVersion).toBe(v0 + 1);
    s.getState().patchEpisode('1|a', { played: true }); // already played: no change
    expect(s.getState().countsVersion).toBe(v0 + 1);
    s.getState().patchEpisodes('1', ['a', 'b'], { archived: true });
    expect(s.getState().countsVersion).toBe(v0 + 2);
    s.getState().patchEpisodes('1', ['a', 'b'], { starred: true });
    expect(s.getState().countsVersion).toBe(v0 + 2);
  });
});

it('puts a new folder at the top of the grid', () => {
  const s = createLibraryStore(createMemoryKV());
  s.getState().subscribe(pod('1'));
  s.getState().subscribe(pod('2'));
  const a = s.getState().createFolder('A', '#fff');
  const b = s.getState().createFolder('B', '#fff');
  expect(s.getState().homeOrder).toEqual([`f:${b}`, `f:${a}`, 'p:1', 'p:2']);
});

describe('placeInHome (dragging a podcast out of a folder, or up from search, into the main order)', () => {
  it('sets the home order and releases folder membership for podcasts placed in it', () => {
    const s = createLibraryStore(createMemoryKV());
    s.getState().subscribe(pod('1'));
    s.getState().subscribe(pod('2'));
    s.getState().subscribe(pod('3'));
    const f = s.getState().createFolder('News', '#fff');
    s.getState().moveToFolder('2', f);
    expect(s.getState().homeOrder).toEqual([`f:${f}`, 'p:1', 'p:3']);

    s.getState().placeInHome(['p:1', 'p:2', 'p:3', `f:${f}`]);
    expect(s.getState().homeOrder).toEqual(['p:1', 'p:2', 'p:3']); // 2 was the folder's last show
    expect(s.getState().subscriptions['2'].folderId).toBeUndefined();
    expect(s.getState().folders[f]).toBeUndefined();
    expect(s.getState().sort).toBe('custom');
  });

  it('leaves podcasts that stay in their folders alone', () => {
    const s = createLibraryStore(createMemoryKV());
    s.getState().subscribe(pod('1'));
    s.getState().subscribe(pod('2'));
    const f = s.getState().createFolder('X', '#000');
    s.getState().moveToFolder('2', f);
    s.getState().placeInHome([`f:${f}`, 'p:1']);
    expect(s.getState().subscriptions['2'].folderId).toBe(f);
    expect(s.getState().folderOrder[f]).toEqual(['2']);
  });
});

describe('applyCategories', () => {
  const setup = () => {
    const s = createLibraryStore(createMemoryKV());
    for (const id of ['1', '2', '3', '4', '5']) s.getState().subscribe(pod(id));
    return s;
  };

  it('makes new folders at the top, reuses existing ones, and files only loose shows', () => {
    const s = setup();
    const mine = s.getState().createFolder('Mine', '#fff');
    s.getState().moveToFolder('5', mine);
    const news = s.getState().createFolder('News', '#000');
    s.getState().applyCategories([
      { name: 'Comedy', podcastIds: ['1', '2'] },
      { name: 'News', folderId: news, podcastIds: ['3', '5'] },
    ]);
    const st = s.getState();
    const comedy = Object.values(st.folders).find((f) => f.name === 'Comedy')!;
    expect(st.folderOrder[comedy.id]).toEqual(['1', '2']);
    expect(st.folderOrder[news]).toEqual(['3']); // 5 was already in a folder: untouched
    expect(st.folderOrder[mine]).toEqual(['5']);
    expect(st.subscriptions['1'].folderId).toBe(comedy.id);
    expect(st.subscriptions['5'].folderId).toBe(mine);
    expect(st.homeOrder).toEqual([`f:${comedy.id}`, `f:${news}`, `f:${mine}`, 'p:4']);
  });

  it('does nothing when nothing can move', () => {
    const s = setup();
    const before = s.getState().homeOrder;
    s.getState().applyCategories([{ name: 'X', podcastIds: ['nope'] }]);
    expect(s.getState().homeOrder).toBe(before);
    expect(Object.keys(s.getState().folders)).toHaveLength(0);
  });
});

describe('a folder goes when its last show leaves', () => {
  const setup = () => {
    const s = createLibraryStore(createMemoryKV());
    for (const id of ['1', '2', '3']) s.getState().subscribe(pod(id));
    const f = s.getState().createFolder('F', '#fff');
    s.getState().moveToFolder('1', f);
    return { s, f };
  };
  const gone = (s: ReturnType<typeof setup>['s'], f: string) =>
    s.getState().folders[f] === undefined && s.getState().folderOrder[f] === undefined && !s.getState().homeOrder.includes(`f:${f}`);

  it('removeFromFolder', () => {
    const { s, f } = setup();
    s.getState().removeFromFolder('1');
    expect(gone(s, f)).toBe(true);
    expect(s.getState().homeOrder).toContain('p:1');
    expect(s.getState().subscriptions['1'].folderId).toBeUndefined();
  });

  it('unsubscribing it', () => {
    const { s, f } = setup();
    s.getState().unsubscribe('1');
    expect(gone(s, f)).toBe(true);
  });

  it('moving it to another folder', () => {
    const { s, f } = setup();
    const g = s.getState().createFolder('G', '#000');
    s.getState().moveToFolder('1', g);
    expect(gone(s, f)).toBe(true);
    expect(s.getState().folderOrder[g]).toEqual(['1']);
  });

  it('placing it in the home grid', () => {
    const { s, f } = setup();
    s.getState().placeInHome(['p:1', 'p:2', 'p:3', `f:${f}`]);
    expect(gone(s, f)).toBe(true);
    expect(s.getState().homeOrder).toEqual(['p:1', 'p:2', 'p:3']);
  });

  it('keeps a folder that still has shows, a new empty folder, and an already empty one', () => {
    const { s, f } = setup();
    s.getState().moveToFolder('2', f);
    s.getState().removeFromFolder('1');
    expect(s.getState().folders[f]).toBeDefined();
    expect(s.getState().folderOrder[f]).toEqual(['2']);
    const empty = s.getState().createFolder('Empty', '#000');
    s.getState().unsubscribe('3'); // a loose show: no folder involved
    expect(s.getState().folders[empty]).toBeDefined();
  });
});
