import type { Episode, Podcast } from '@/api/types';
import { createMemoryKV } from '@/db/storage';
import { createFakeEpisodeCache } from '@/downloads/episode-cache';
import { createFakeEngine } from '@/player/fake-engine';

import { createLibraryStore, episodeKey } from './library';
import { createPlayerStore } from './player';
import { createSettingsStore } from './settings';
import { useToast } from './toast';

jest.mock('@/db/kv', () => ({ kv: {} }));
jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn(), NetworkStateType: { CELLULAR: 'CELLULAR' } }));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: { cache: '' } }));
// The module-level singleton builds a real engine on import; give it a no-op one.
jest.mock('@/player/engine', () => ({
  createExpoEngine: () => ({ load() {}, play() {}, pause() {}, seekTo() {}, setRate() {}, subscribe: () => () => {} }),
}));

const podcast: Podcast = { id: 'p', title: 'Show', author: 'A', artwork: 'art', feedUrl: 'https://f' };
const episode: Episode = { id: 'e', podcastId: 'p', title: 'Ep', description: '', audioUrl: 'https://a.mp3', published: 0, durationSec: 1800 };
const key = episodeKey('p', 'e');

/** Controllable foreground/background signal. */
function createFakeAppState(initiallyActive = true) {
  let active = initiallyActive;
  const listeners = new Set<(a: boolean) => void>();
  return {
    appState: {
      isActive: () => active,
      subscribe: (l: (a: boolean) => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    },
    set(next: boolean) {
      active = next;
      listeners.forEach((l) => l(next));
    },
  };
}

function setup(opts: { now?: () => number; active?: boolean; beforeStream?: (e: Episode) => Promise<boolean>; cache?: boolean } = {}) {
  const fake = createFakeEngine();
  const app = createFakeAppState(opts.active ?? true);
  const storage = createMemoryKV();
  const library = createLibraryStore(createMemoryKV());
  const settings = createSettingsStore(createMemoryKV());
  library.getState().subscribe(podcast);
  const fakeCache = createFakeEpisodeCache();
  const player = createPlayerStore({
    engine: fake.engine,
    storage,
    library,
    settings,
    now: opts.now,
    appState: app.appState,
    beforeStream: opts.beforeStream,
    cache: opts.cache ? fakeCache.cache : undefined,
  });
  return { ...fake, storage, library, settings, player, setActive: app.set, fakeCache };
}

it('plays an episode, loading it with lock-screen metadata inputs and the saved rate', () => {
  const t = setup();
  t.settings.getState().set({ playbackRate: 1.5 });
  t.player.getState().play(episode, podcast);
  expect(t.calls).toEqual(['load https://a.mp3 @0 x1.5', 'play']);
  expect(t.state.meta).toEqual({ title: 'Ep', artist: 'Show', artworkUrl: 'art' });
  expect(t.player.getState().playing).toBe(true);
  expect(t.player.getState().current?.episode.id).toBe('e');
});

it('resumes from saved progress, honouring skip-first only on a fresh start', () => {
  const t = setup();
  t.library.getState().setOverride('p', { skipFirstSec: 20 });
  t.player.getState().play(episode, podcast);
  expect(t.calls[0]).toBe('load https://a.mp3 @20 x1');

  const t2 = setup();
  t2.library.getState().patchEpisode(key, { progressMs: 90_000 });
  t2.player.getState().play(episode, podcast);
  // Intelligent resume (on by default) picks up two seconds early.
  expect(t2.calls[0]).toBe('load https://a.mp3 @88 x1');
});

it('prefers the downloaded file over streaming', () => {
  const t = setup();
  t.library.getState().patchEpisode(key, { downloadedUri: 'file:///x.mp3' });
  t.player.getState().play(episode, podcast);
  expect(t.calls[0]).toContain('load file:///x.mp3');
});

it('toggles play/pause without reloading', () => {
  const t = setup();
  t.player.getState().play(episode, podcast);
  t.player.getState().toggle();
  expect(t.player.getState().playing).toBe(false);
  t.player.getState().toggle();
  expect(t.player.getState().playing).toBe(true);
  expect(t.calls.filter((c) => c.startsWith('load'))).toHaveLength(1);
});

it('skips by the configured seconds and clamps to the episode', () => {
  const t = setup();
  t.settings.getState().set({ skipBackSec: 10, skipForwardSec: 45 });
  t.player.getState().play(episode, podcast);
  t.player.getState().skipForward();
  expect(t.player.getState().positionSec).toBe(45);
  t.player.getState().skipBack();
  expect(t.player.getState().positionSec).toBe(35);
  t.player.getState().seekTo(99_999);
  expect(t.player.getState().positionSec).toBe(1800);
  t.player.getState().seekTo(-4);
  expect(t.player.getState().positionSec).toBe(0);
});

it('writes progress to the library every few seconds and on pause', () => {
  const t = setup({ now: () => 1000 });
  t.player.getState().play(episode, podcast);
  t.emit({ positionSec: 2, playing: true });
  expect(t.library.getState().episodes[key]).toBeUndefined();
  t.emit({ positionSec: 6, playing: true });
  expect(t.library.getState().episodes[key]).toMatchObject({ progressMs: 6000, lastPlayed: 1000, played: false });
  t.emit({ positionSec: 7, playing: false });
  expect(t.library.getState().episodes[key].progressMs).toBe(7000);
});

it('marks the episode played when it ends and rewinds it', () => {
  const t = setup();
  t.player.getState().play(episode, podcast);
  t.emit({ positionSec: 1800, finished: true, playing: false });
  expect(t.library.getState().episodes[key]).toMatchObject({ played: true, progressMs: 0 });
  expect(t.player.getState().positionSec).toBe(0);
  expect(t.player.getState().playing).toBe(false);
  // Pressing play again reloads it from the start.
  t.player.getState().toggle();
  expect(t.calls.filter((c) => c.startsWith('load'))).toHaveLength(2);
});

it('treats the skip-last zone as the end', () => {
  const t = setup();
  t.library.getState().setOverride('p', { skipLastSec: 30 });
  t.player.getState().play(episode, podcast);
  t.emit({ positionSec: 1775, playing: true });
  expect(t.library.getState().episodes[key]).toMatchObject({ played: true });
  expect(t.player.getState().playing).toBe(false);
});

it('stops at the sleep timer', () => {
  jest.useFakeTimers();
  let clock = 0;
  const t = setup({ now: () => clock });
  t.player.getState().play(episode, podcast);
  t.player.getState().setSleep({ minutes: 10 });
  expect(t.player.getState().sleep).toEqual({ kind: 'timer', endsAt: 600_000, minutes: 10 });
  clock = 600_100;
  jest.advanceTimersByTime(600_100);
  expect(t.player.getState().playing).toBe(false);
  expect(t.player.getState().sleep).toBeNull();
  jest.useRealTimers();
});

it('can cancel the sleep timer', () => {
  jest.useFakeTimers();
  const t = setup({ now: () => 0 });
  t.player.getState().play(episode, podcast);
  t.player.getState().setSleep({ minutes: 5 });
  t.player.getState().setSleep(null);
  jest.advanceTimersByTime(10 * 60_000);
  expect(t.player.getState().playing).toBe(true);
  jest.useRealTimers();
});

it('persists the current episode and restores it paused after a restart', async () => {
  const t = setup();
  t.player.getState().play(episode, podcast);
  t.emit({ positionSec: 120, playing: false });
  await Promise.resolve();

  const t2 = setup();
  await t2.storage.setItem('player.v1', (await t.storage.getItem('player.v1')) as string);
  await t2.player.getState().hydrate();
  expect(t2.player.getState().current?.episode.id).toBe('e');
  expect(t2.player.getState().positionSec).toBe(120);
  expect(t2.player.getState().playing).toBe(false);
  expect(t2.calls).toEqual([]); // nothing loaded until play
  t2.player.getState().toggle();
  expect(t2.calls).toEqual(['load https://a.mp3 @118 x1', 'play']);
});

it('changing speed updates the engine and the saved setting', () => {
  const t = setup();
  t.player.getState().play(episode, podcast);
  t.player.getState().setRate(1.75);
  expect(t.calls).toContain('rate 1.75');
  expect(t.settings.getState().playbackRate).toBe(1.75);
  expect(t.player.getState().rate).toBe(1.75);
});

it('reports a failed load, stays paused and keeps the saved spot so retry resumes there', () => {
  const t = setup();
  t.library.getState().patchEpisode(key, { progressMs: 60_000 });
  t.player.getState().play(episode, podcast);
  t.fail();
  expect(t.player.getState().playing).toBe(false);
  expect(t.player.getState().current?.episode.id).toBe('e');
  expect(useToast.getState().message).toMatch(/Couldn't play/);
  t.player.getState().toggle(); // retry reloads from where it was
  expect(t.calls.filter((c) => c.startsWith('load'))).toEqual(['load https://a.mp3 @58 x1', 'load https://a.mp3 @58 x1']);
});

describe('in the background', () => {
  it('does not publish position updates to the UI but still saves progress', () => {
    const t = setup();
    t.player.getState().play(episode, podcast);
    t.emit({ positionSec: 2, playing: true });
    expect(t.player.getState().positionSec).toBe(2);

    t.setActive(false);
    t.emit({ positionSec: 30, playing: true });
    t.emit({ positionSec: 60, playing: true });
    expect(t.player.getState().positionSec).toBe(2); // UI copy untouched: no re-renders
    expect(t.library.getState().episodes[key].progressMs).toBeGreaterThan(0); // but progress is saved
    expect(t.library.getState().episodes[key].progressMs).toBe(60_000);
  });

  it('does not re-render subscribers for position ticks while backgrounded', () => {
    const t = setup();
    t.player.getState().play(episode, podcast);
    t.setActive(false);
    const listener = jest.fn();
    const unsub = t.player.subscribe(listener);
    t.emit({ positionSec: 10, playing: true });
    t.emit({ positionSec: 11, playing: true });
    t.emit({ positionSec: 12, playing: true });
    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  it('syncs the UI position once when the app returns to the foreground', () => {
    const t = setup();
    t.player.getState().play(episode, podcast);
    t.setActive(false);
    t.emit({ positionSec: 300, playing: true });
    expect(t.player.getState().positionSec).toBe(0);
    t.setActive(true);
    expect(t.player.getState().positionSec).toBe(300);
  });

  it('still passes play/pause changes through', () => {
    const t = setup();
    t.player.getState().play(episode, podcast);
    t.setActive(false);
    t.emit({ positionSec: 10, playing: false });
    expect(t.player.getState().playing).toBe(false);
  });

  it('still ends the episode and honours the sleep timer', () => {
    jest.useFakeTimers();
    let clock = 0;
    const t = setup({ now: () => clock });
    t.player.getState().play(episode, podcast);
    t.setActive(false);
    t.player.getState().setSleep({ minutes: 1 });
    clock = 61_000;
    t.emit({ positionSec: 5, playing: true });
    expect(t.player.getState().playing).toBe(false);
    expect(t.player.getState().sleep).toBeNull();
    jest.useRealTimers();

    const t2 = setup();
    t2.player.getState().play(episode, podcast);
    t2.setActive(false);
    t2.emit({ positionSec: 1800, finished: true, playing: false });
    expect(t2.library.getState().episodes[key]).toMatchObject({ played: true });
  });

  it('seeks relative to the true position, not the stale UI one', () => {
    const t = setup();
    t.settings.getState().set({ skipForwardSec: 30 });
    t.player.getState().play(episode, podcast);
    t.setActive(false);
    t.emit({ positionSec: 100, playing: true });
    t.setActive(true);
    t.player.getState().skipForward();
    expect(t.player.getState().positionSec).toBe(130);
  });
});

describe('intelligent resume', () => {
  it('starts a saved episode two seconds early', () => {
    const t = setup();
    t.library.getState().patchEpisode(key, { progressMs: 90_000 });
    t.player.getState().play(episode, podcast);
    expect(t.calls[0]).toBe('load https://a.mp3 @88 x1');
  });

  it('does not back up a fresh start (only a real resume)', () => {
    const t = setup();
    t.library.getState().setOverride('p', { skipFirstSec: 20 });
    t.player.getState().play(episode, podcast);
    expect(t.calls[0]).toBe('load https://a.mp3 @20 x1');
  });

  it('seeks back two seconds when resuming from a pause', () => {
    const t = setup();
    t.player.getState().play(episode, podcast);
    t.emit({ positionSec: 100, playing: true });
    t.player.getState().toggle(); // pause
    t.calls.length = 0;
    t.player.getState().toggle(); // resume
    expect(t.calls).toEqual(['seek 98', 'play']);
  });

  it('does nothing when switched off', () => {
    const t = setup();
    t.settings.getState().set({ intelligentResume: false });
    t.library.getState().patchEpisode(key, { progressMs: 90_000 });
    t.player.getState().play(episode, podcast);
    expect(t.calls[0]).toBe('load https://a.mp3 @90 x1');
    t.emit({ positionSec: 100, playing: true });
    t.player.getState().toggle();
    t.calls.length = 0;
    t.player.getState().toggle();
    expect(t.calls).toEqual(['play']);
  });

  it('does not seek skips: skipping is exact', () => {
    const t = setup();
    t.player.getState().play(episode, podcast);
    t.emit({ positionSec: 100, playing: true });
    t.player.getState().skipForward();
    expect(t.player.getState().positionSec).toBe(130);
  });
});

describe('warn when using mobile data', () => {
  it('waits for the answer, then plays', async () => {
    let answer!: (ok: boolean) => void;
    const t = setup({ beforeStream: () => new Promise<boolean>((r) => (answer = r)) });
    t.player.getState().play(episode, podcast);
    expect(t.calls).toEqual([]); // nothing loaded while the prompt is open
    answer(true);
    await Promise.resolve();
    expect(t.calls).toEqual(['load https://a.mp3 @0 x1', 'play']);
  });

  it('does not play when declined', async () => {
    const t = setup({ beforeStream: async () => false });
    t.player.getState().play(episode, podcast);
    await Promise.resolve();
    expect(t.calls).toEqual([]);
    expect(t.player.getState().current).toBeNull();
  });

  it('is skipped for downloaded episodes', () => {
    const beforeStream = jest.fn(async () => false);
    const t = setup({ beforeStream });
    t.library.getState().patchEpisode(key, { downloadedUri: 'file:///x.mp3' });
    t.player.getState().play(episode, podcast);
    expect(beforeStream).not.toHaveBeenCalled();
    expect(t.calls[0]).toContain('load file:///x.mp3');
  });

  it('is not asked again when just resuming the loaded episode', async () => {
    const beforeStream = jest.fn(async () => true);
    const t = setup({ beforeStream });
    t.player.getState().play(episode, podcast);
    await Promise.resolve();
    t.player.getState().toggle(); // pause
    t.player.getState().toggle(); // resume
    expect(beforeStream).toHaveBeenCalledTimes(1);
  });

  it('a newer play request wins over a slow prompt for an older one', async () => {
    const answers: ((ok: boolean) => void)[] = [];
    const t = setup({ beforeStream: () => new Promise<boolean>((r) => answers.push(r)) });
    const other: Episode = { ...episode, id: 'e2', audioUrl: 'https://b.mp3' };
    t.player.getState().play(episode, podcast);
    t.player.getState().play(other, podcast);
    answers[0](true);
    answers[1](true);
    await Promise.resolve();
    expect(t.calls.filter((c) => c.startsWith('load'))).toEqual(['load https://b.mp3 @0 x1']);
  });
});

describe('auto restart sleep timer', () => {
  function withClock() {
    jest.useFakeTimers();
    let clock = 0;
    const t = setup({ now: () => clock });
    t.settings.getState().set({ autoRestartSleepTimer: true });
    return { t, at: (ms: number) => (clock = ms) };
  }
  afterEach(() => jest.useRealTimers());

  it('re-arms the same length when resuming within 5 minutes of the last pause', () => {
    const { t, at } = withClock();
    t.player.getState().play(episode, podcast);
    t.player.getState().setSleep({ minutes: 30 });
    at(10 * 60_000);
    t.player.getState().toggle(); // pause at 10 min
    at(13 * 60_000);
    t.player.getState().toggle(); // resume 3 min later
    expect(t.player.getState().sleep).toEqual({ kind: 'timer', endsAt: 13 * 60_000 + 30 * 60_000, minutes: 30 });
  });

  it('restarts after the timer itself stopped playback', () => {
    const { t, at } = withClock();
    t.player.getState().play(episode, podcast);
    t.player.getState().setSleep({ minutes: 5 });
    at(5 * 60_000 + 100);
    jest.advanceTimersByTime(5 * 60_000 + 100);
    expect(t.player.getState().sleep).toBeNull();
    at(7 * 60_000);
    t.player.getState().toggle(); // wake up, hit play 2 min later
    expect(t.player.getState().sleep).toMatchObject({ kind: 'timer', minutes: 5 });
  });

  it('does not restart after more than 5 minutes', () => {
    const { t, at } = withClock();
    t.player.getState().play(episode, podcast);
    t.player.getState().setSleep({ minutes: 5 });
    at(5 * 60_000 + 100);
    jest.advanceTimersByTime(5 * 60_000 + 100);
    at(11 * 60_000);
    t.player.getState().toggle();
    expect(t.player.getState().sleep).toBeNull();
  });

  it('does nothing when the setting is off, or after the timer was turned off', () => {
    const { t, at } = withClock();
    t.settings.getState().set({ autoRestartSleepTimer: false });
    t.player.getState().play(episode, podcast);
    t.player.getState().setSleep({ minutes: 30 });
    t.player.getState().toggle();
    at(60_000);
    t.player.getState().toggle();
    // still the original timer (not re-armed from "now")
    expect(t.player.getState().sleep).toMatchObject({ minutes: 30, endsAt: 30 * 60_000 });

    const { t: t2, at: at2 } = withClock();
    t2.player.getState().play(episode, podcast);
    t2.player.getState().setSleep({ minutes: 30 });
    t2.player.getState().setSleep(null);
    t2.player.getState().toggle();
    at2(60_000);
    t2.player.getState().toggle();
    expect(t2.player.getState().sleep).toBeNull();
  });
});

describe('cache whole episodes', () => {
  it('streams at once, then swaps to the cached file at the current position while playing', () => {
    const t = setup({ cache: true });
    t.settings.getState().set({ cacheWholeEpisodes: true });
    t.player.getState().play(episode, podcast);
    expect(t.calls).toEqual(['load https://a.mp3 @0 x1', 'play']);
    expect(t.fakeCache.log).toEqual(['start p|e']);

    t.emit({ positionSec: 42, playing: true });
    t.calls.length = 0;
    t.fakeCache.finish('p|e');
    expect(t.calls).toEqual(['load file:///cache/p|e.mp3 @42 x1', 'play']);
  });

  it('stays paused if the file arrives while paused', () => {
    const t = setup({ cache: true });
    t.settings.getState().set({ cacheWholeEpisodes: true });
    t.player.getState().play(episode, podcast);
    t.emit({ positionSec: 10, playing: false });
    t.calls.length = 0;
    t.fakeCache.finish('p|e');
    expect(t.calls).toEqual(['load file:///cache/p|e.mp3 @10 x1']);
  });

  it('is not started when off, when downloaded, or on web (no cache)', () => {
    const a = setup({ cache: true });
    a.player.getState().play(episode, podcast);
    expect(a.fakeCache.log).toEqual([]);

    const b = setup({ cache: true });
    b.settings.getState().set({ cacheWholeEpisodes: true });
    b.library.getState().patchEpisode(key, { downloadedUri: 'file:///x.mp3' });
    b.player.getState().play(episode, podcast);
    expect(b.fakeCache.log).toEqual([]);

    const c = setup();
    c.settings.getState().set({ cacheWholeEpisodes: true });
    expect(() => c.player.getState().play(episode, podcast)).not.toThrow();
  });

  it('ignores a file that arrives after you moved on, and releases the old one', () => {
    const t = setup({ cache: true });
    t.settings.getState().set({ cacheWholeEpisodes: true });
    t.player.getState().play(episode, podcast);
    const other: Episode = { ...episode, id: 'e2', audioUrl: 'https://b.mp3' };
    t.player.getState().play(other, podcast);
    expect(t.fakeCache.log).toEqual(['start p|e', 'release p|e', 'start p|e2']);
    t.calls.length = 0;
    t.fakeCache.finish('p|e'); // already released: no-op
    expect(t.calls).toEqual([]);
  });

  it('releases the file when the episode finishes', () => {
    const t = setup({ cache: true });
    t.settings.getState().set({ cacheWholeEpisodes: true });
    t.player.getState().play(episode, podcast);
    t.emit({ positionSec: 1800, finished: true, playing: false });
    expect(t.fakeCache.log).toContain('release p|e');
  });

  it('plays from an already cached file without streaming or asking about data', async () => {
    const beforeStream = jest.fn(async () => false);
    const t = setup({ cache: true, beforeStream });
    t.settings.getState().set({ cacheWholeEpisodes: true });
    t.fakeCache.cache.start('p|e', 'https://a.mp3', () => {});
    t.fakeCache.finish('p|e');
    t.player.getState().play(episode, podcast);
    expect(beforeStream).not.toHaveBeenCalled();
    expect(t.calls[0]).toContain('load file:///cache/p|e.mp3');
  });
});
