import type { Episode, Podcast } from '@/api/types';
import { createMemoryKV } from '@/db/storage';
import { createFakeEngine } from '@/player/fake-engine';

import { createLibraryStore, episodeKey } from './library';
import { createPlayerStore } from './player';
import { createSettingsStore } from './settings';
import { useToast } from './toast';

jest.mock('@/db/kv', () => ({ kv: {} }));
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

function setup(opts: { now?: () => number; active?: boolean } = {}) {
  const fake = createFakeEngine();
  const app = createFakeAppState(opts.active ?? true);
  const storage = createMemoryKV();
  const library = createLibraryStore(createMemoryKV());
  const settings = createSettingsStore(createMemoryKV());
  library.getState().subscribe(podcast);
  const player = createPlayerStore({ engine: fake.engine, storage, library, settings, now: opts.now, appState: app.appState });
  return { ...fake, storage, library, settings, player, setActive: app.set };
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
  expect(t2.calls[0]).toBe('load https://a.mp3 @90 x1');
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
  expect(t2.calls).toEqual(['load https://a.mp3 @120 x1', 'play']);
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
  expect(t.calls.filter((c) => c.startsWith('load'))).toEqual(['load https://a.mp3 @60 x1', 'load https://a.mp3 @60 x1']);
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
