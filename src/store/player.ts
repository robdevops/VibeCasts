import { create } from 'zustand';

import type { Episode, Podcast } from '@/api/types';
import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';
import { emptyEpisodeState, episodeKey, isFinished } from '@/lib/episode-state';
import { clampSeek, reachedSkipLast, startPosition } from '@/lib/player-math';
import { createExpoEngine, type EngineStatus, type PlayerEngine } from '@/player/engine';

import { useLibrary } from './library';
import { useSettings } from './settings';
import { useToast } from './toast';

export type Sleep = { kind: 'timer'; endsAt: number; minutes: number } | { kind: 'episode' } | null;

export type PlayerData = {
  current: { podcast: Podcast; episode: Episode } | null;
  playing: boolean;
  buffering: boolean;
  positionSec: number;
  durationSec: number;
  rate: number;
  sleep: Sleep;
};

type Actions = {
  hydrated: boolean;
  hydrate(): Promise<void>;
  play(episode: Episode, podcast: Podcast): void;
  toggle(): void;
  pause(): void;
  seekTo(sec: number): void;
  seekBy(deltaSec: number): void;
  skipBack(): void;
  skipForward(): void;
  setRate(rate: number): void;
  setSleep(opt: { minutes: number } | 'episode' | null): void;
};

type Deps = {
  engine: PlayerEngine;
  storage: KV;
  /** Library/settings are injected so tests can use isolated instances. */
  library: Pick<typeof useLibrary, 'getState'>;
  settings: Pick<typeof useSettings, 'getState'>;
  now: () => number;
};

const STORAGE_KEY = 'player.v1';
/** How often (in played seconds) progress is written to the library while playing. */
const SAVE_EVERY_SEC = 5;

export function createPlayerStore(deps: Partial<Deps> = {}) {
  const engine = deps.engine ?? createExpoEngine();
  const storage = deps.storage ?? kv;
  const library = deps.library ?? useLibrary;
  const settings = deps.settings ?? useSettings;
  const now = deps.now ?? Date.now;

  let loadedKey: string | null = null;
  let lastSavedSec = 0;
  let sleepTimer: ReturnType<typeof setTimeout> | undefined;

  const store = create<PlayerData & Actions>()((set, get) => {
    const keyOf = () => {
      const c = get().current;
      return c ? episodeKey(c.podcast.id, c.episode.id) : null;
    };

    const persist = () => {
      const { current, positionSec } = get();
      const write = current
        ? storage.setItem(STORAGE_KEY, JSON.stringify({ podcast: current.podcast, episode: current.episode, positionSec }))
        : storage.removeItem(STORAGE_KEY);
      write.catch(() => {});
    };

    /** Write the position into the library; counts as played once near the end. */
    const saveProgress = () => {
      const { current, positionSec, durationSec } = get();
      const key = keyOf();
      if (!current || !key) return;
      lastSavedSec = positionSec;
      const dur = durationSec || current.episode.durationSec;
      if (isFinished(positionSec * 1000, dur)) {
        library.getState().patchEpisode(key, { played: true, progressMs: 0, lastPlayed: now() });
      } else {
        library.getState().patchEpisode(key, { progressMs: Math.round(positionSec * 1000), played: false, lastPlayed: now() });
      }
      persist();
    };

    const clearSleepTimer = () => {
      if (sleepTimer) clearTimeout(sleepTimer);
      sleepTimer = undefined;
    };

    const stopForSleep = () => {
      // Clear the timer first: pausing emits a status update that would re-run checkSleep.
      clearSleepTimer();
      set({ sleep: null, playing: false });
      saveProgress();
      engine.pause();
    };

    const finish = () => {
      const key = keyOf();
      const { current } = get();
      if (!current || !key) return;
      // Unload first so the status update from pausing is ignored rather than re-saved.
      loadedKey = null;
      clearSleepTimer();
      library.getState().patchEpisode(key, { played: true, progressMs: 0, lastPlayed: now() });
      // Leave the episode selected but rewound, so pressing play again starts it over.
      set({ playing: false, positionSec: 0, sleep: null });
      engine.pause();
      persist();
    };

    const checkSleep = () => {
      const { sleep } = get();
      if (sleep?.kind === 'timer' && now() >= sleep.endsAt) stopForSleep();
    };

    engine.subscribe((s: EngineStatus) => {
      if (!loadedKey || loadedKey !== keyOf()) return;
      if (s.error) {
        // Keep the episode selected (and the saved position) so retrying resumes in place.
        loadedKey = null;
        set({ playing: false, buffering: false });
        useToast.getState().show("Couldn't play this episode. Check your connection and try again.");
        return;
      }
      const prevPlaying = get().playing;
      set({
        playing: s.playing,
        buffering: s.buffering,
        positionSec: s.loaded ? s.positionSec : get().positionSec,
        durationSec: s.durationSec > 0 ? s.durationSec : get().durationSec,
      });
      if (s.finished) {
        finish();
        return;
      }
      const c = get().current;
      const skipLast = c ? library.getState().subscriptions[c.podcast.id]?.overrides.skipLastSec ?? 0 : 0;
      if (s.playing && reachedSkipLast(s.positionSec, get().durationSec, skipLast)) {
        finish();
        return;
      }
      checkSleep();
      if ((prevPlaying && !s.playing) || (s.playing && Math.abs(s.positionSec - lastSavedSec) >= SAVE_EVERY_SEC)) {
        saveProgress();
      }
    });

    const load = (episode: Episode, podcast: Podcast, startSec: number) => {
      const key = episodeKey(podcast.id, episode.id);
      const downloaded = library.getState().episodes[key]?.downloadedUri;
      const rate = settings.getState().playbackRate;
      engine.load(downloaded ?? episode.audioUrl, startSec, rate, {
        title: episode.title,
        artist: podcast.title,
        artworkUrl: episode.artwork ?? podcast.artwork,
      });
      loadedKey = key;
      lastSavedSec = startSec;
      set({
        current: { podcast, episode },
        positionSec: startSec,
        durationSec: episode.durationSec,
        rate,
        buffering: true,
      });
    };

    return {
      current: null,
      playing: false,
      buffering: false,
      positionSec: 0,
      durationSec: 0,
      rate: settings.getState().playbackRate,
      sleep: null,
      hydrated: false,

      async hydrate() {
        try {
          const raw = await storage.getItem(STORAGE_KEY);
          if (raw) {
            const saved = JSON.parse(raw) as { podcast: Podcast; episode: Episode; positionSec: number };
            // Restored paused and not loaded: audio is fetched on first play.
            set({
              current: { podcast: saved.podcast, episode: saved.episode },
              positionSec: saved.positionSec,
              durationSec: saved.episode.durationSec,
            });
          }
        } catch {
          // Nothing to restore.
        }
        set({ hydrated: true, rate: settings.getState().playbackRate });
      },

      play(episode, podcast) {
        const key = episodeKey(podcast.id, episode.id);
        if (loadedKey === key && keyOf() === key) {
          engine.play();
          return;
        }
        if (get().playing) saveProgress();
        const state = library.getState().episodes[key] ?? emptyEpisodeState;
        const overrides = library.getState().subscriptions[podcast.id]?.overrides;
        // A finished episode replays from the top.
        const start = state.played ? (overrides?.skipFirstSec ?? 0) : startPosition(state.progressMs, overrides?.skipFirstSec ?? 0, episode.durationSec);
        load(episode, podcast, start);
        engine.play();
        persist();
      },

      toggle() {
        const { current, playing } = get();
        if (!current) return;
        if (playing) {
          engine.pause();
          return;
        }
        if (loadedKey === keyOf()) {
          engine.play();
        } else {
          // Restored from storage (or finished): load now, resuming from where it stopped.
          const key = episodeKey(current.podcast.id, current.episode.id);
          const state = library.getState().episodes[key] ?? emptyEpisodeState;
          const start = get().positionSec > 0 ? get().positionSec : startPosition(state.progressMs, 0, current.episode.durationSec);
          load(current.episode, current.podcast, start);
          engine.play();
        }
      },

      pause() {
        if (get().playing) engine.pause();
      },

      seekTo(sec) {
        const { current, durationSec } = get();
        if (!current) return;
        const target = clampSeek(sec, durationSec || current.episode.durationSec);
        set({ positionSec: target });
        if (loadedKey === keyOf()) engine.seekTo(target);
        saveProgress();
      },

      seekBy(delta) {
        get().seekTo(get().positionSec + delta);
      },
      skipBack() {
        get().seekBy(-settings.getState().skipBackSec);
      },
      skipForward() {
        get().seekBy(settings.getState().skipForwardSec);
      },

      setRate(rate) {
        set({ rate });
        settings.getState().set({ playbackRate: rate });
        engine.setRate(rate);
      },

      setSleep(opt) {
        clearSleepTimer();
        if (opt === null) {
          set({ sleep: null });
        } else if (opt === 'episode') {
          set({ sleep: { kind: 'episode' } });
        } else {
          const endsAt = now() + opt.minutes * 60_000;
          set({ sleep: { kind: 'timer', endsAt, minutes: opt.minutes } });
          // Status updates also check this, but a paused/buffering player emits none.
          sleepTimer = setTimeout(checkSleep, opt.minutes * 60_000 + 50);
        }
      },
    };
  });

  return store;
}

export const usePlayer = createPlayerStore();
