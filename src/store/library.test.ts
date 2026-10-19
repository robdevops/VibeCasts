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
    expect(s.getState().homeOrder).toEqual(['p:2', `f:${f}`]);
    expect(s.getState().folderOrder[f]).toEqual(['1']);

    s.getState().removeFromFolder('1');
    expect(s.getState().homeOrder).toEqual(['p:2', `f:${f}`, 'p:1']);
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
    s.getState().unsubscribe('1');
    expect(s.getState().folderOrder[f]).toEqual([]);
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
