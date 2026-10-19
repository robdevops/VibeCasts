import type { Episode, Podcast } from '@/api/types';
import { createMemoryKV } from '@/db/storage';
import type { Conditions } from '@/lib/downloads';
import { episodeKey } from '@/lib/episode-state';
import { createLibraryStore } from '@/store/library';
import { createSettingsStore } from '@/store/settings';

import { createAutomation } from './auto';
import { createDownloadManager, type DownloadFiles } from './download-manager';

jest.mock('@/db/kv', () => ({ kv: {} }));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: { document: '', cache: '' } }));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn() }));
jest.mock('expo-battery', () => ({ getBatteryStateAsync: jest.fn(), BatteryState: { CHARGING: 2, FULL: 3, UNKNOWN: 0 } }));

const podcast: Podcast = { id: 'p', title: 'Show', author: 'A', artwork: '', feedUrl: 'https://f/p' };
const ep = (id: string): Episode => ({ id, podcastId: 'p', title: id, description: '', audioUrl: `https://a/${id}.mp3`, published: 0, durationSec: 600 });
const episodes = ['e3', 'e2', 'e1'].map(ep); // newest first

function setup(conditions: Conditions = { charging: true, connection: 'wifi', metered: false }) {
  const library = createLibraryStore(createMemoryKV());
  const settings = createSettingsStore(createMemoryKV());
  library.getState().subscribe(podcast);
  library.getState().setOverride('p', { autoDownload: true });
  const fetched: string[] = [];
  const removed: string[] = [];
  const files: DownloadFiles = {
    fetch: async (key) => {
      fetched.push(key);
      return { uri: `file:///d/${key}.mp3`, sizeBytes: 1000 };
    },
    remove: (uri) => void removed.push(uri),
  };
  const downloads = createDownloadManager({ files, storage: createMemoryKV(), library });
  const feeds = { getState: () => ({ feeds: { p: { fetchedAt: 0, total: 3, episodes } } }) } as never;
  let clock = 0;
  const auto = createAutomation({ library, settings, downloads, feeds, conditions: async () => conditions, now: () => clock });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { library, settings, downloads, auto, fetched, removed, settle, advance: (ms: number) => (clock += ms) };
}

const key = (id: string) => episodeKey('p', id);

it('downloads the newest episodes up to the limit and marks them as automatic', async () => {
  const t = setup();
  t.settings.getState().set({ autoDownloadLimit: 2 });
  await t.auto.runDownloads();
  await t.settle();
  expect(t.fetched).toEqual([key('e3'), key('e2')]);
  expect(t.library.getState().episodes[key('e3')]).toMatchObject({ downloadedUri: expect.any(String), autoDownloaded: true });
  expect(t.library.getState().episodes[key('e1')]?.downloadedUri).toBeUndefined();
});

it('rotates the oldest off when the limit is lowered', async () => {
  const t = setup();
  t.settings.getState().set({ autoDownloadLimit: 3 });
  await t.auto.runDownloads();
  await t.settle();
  t.settings.getState().set({ autoDownloadLimit: 1 });
  await t.auto.runDownloads();
  expect(t.removed.sort()).toEqual([`file:///d/${key('e1')}.mp3`, `file:///d/${key('e2')}.mp3`].sort());
  expect(t.library.getState().episodes[key('e1')]?.downloadedUri).toBeUndefined();
  expect(t.library.getState().episodes[key('e3')]?.downloadedUri).toBeDefined();
});

it('waits for the charging and network rules', async () => {
  const t = setup({ charging: false, connection: 'cellular', metered: true });
  await t.auto.runDownloads(); // defaults: Wi-Fi only
  await t.settle();
  expect(t.fetched).toEqual([]);

  const u = setup({ charging: false, connection: 'wifi', metered: false });
  u.settings.getState().set({ downloadOnlyCharging: true });
  await u.auto.runDownloads();
  await u.settle();
  expect(u.fetched).toEqual([]);
});

it('only podcasts with auto download on are downloaded', async () => {
  const t = setup();
  t.library.getState().setOverride('p', { autoDownload: false });
  await t.auto.runDownloads();
  await t.settle();
  expect(t.fetched).toEqual([]);
});

it('a manual download is never rotated off', async () => {
  const t = setup();
  t.downloads.getState().download(ep('e1'), podcast); // the user chose it
  await t.settle();
  t.settings.getState().set({ autoDownloadLimit: 1 });
  await t.auto.runDownloads();
  await t.settle();
  expect(t.removed).toEqual([]);
  expect(t.library.getState().episodes[key('e1')]?.downloadedUri).toBeDefined();
});

it('archives played episodes after the chosen time, deleting their downloads', async () => {
  const t = setup();
  t.downloads.getState().download(ep('e3'), podcast);
  await t.settle();
  t.library.getState().patchEpisode(key('e3'), { played: true, playedAt: 0 });
  t.settings.getState().set({ autoArchive: '24h' });
  t.auto.runArchive();
  expect(t.library.getState().episodes[key('e3')].archived).toBe(false);
  t.advance(25 * 3_600_000);
  t.auto.runArchive();
  expect(t.library.getState().episodes[key('e3')]).toMatchObject({ archived: true, downloadedUri: undefined });
  expect(t.removed).toHaveLength(1);
});

it('delete when finished removes the file of a played episode without archiving it', async () => {
  const t = setup();
  t.downloads.getState().download(ep('e3'), podcast);
  await t.settle();
  t.library.getState().patchEpisode(key('e3'), { played: true });
  t.settings.getState().set({ deleteOnFinish: true });
  t.auto.runArchive();
  expect(t.library.getState().episodes[key('e3')]).toMatchObject({ archived: false, downloadedUri: undefined });
});

it('a failed download is reported and can be retried', async () => {
  const library = createLibraryStore(createMemoryKV());
  let fail = true;
  const downloads = createDownloadManager({
    files: { fetch: async () => { if (fail) throw new Error('offline'); return { uri: 'file:///x.mp3' }; }, remove() {} },
    storage: createMemoryKV(),
    library,
  });
  downloads.getState().download(ep('e1'), podcast);
  await new Promise((r) => setTimeout(r, 0));
  expect(downloads.getState().failed[key('e1')]).toBe(true);
  fail = false;
  downloads.getState().download(ep('e1'), podcast);
  await new Promise((r) => setTimeout(r, 0));
  expect(library.getState().episodes[key('e1')]?.downloadedUri).toBe('file:///x.mp3');
  expect(downloads.getState().failed[key('e1')]).toBeUndefined();
});
