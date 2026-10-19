import { AppState } from 'react-native';
import { create } from 'zustand';

import type { Episode, Podcast } from '@/api/types';
import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';
import { emptyEpisodeState, episodeKey, isFinished } from '@/lib/episode-state';
import { clampSeek, reachedSkipLast, startPosition } from '@/lib/player-math';
import { isPlausibleAdvance, resumeFrom, shouldRestartSleep } from '@/lib/playback-rules';
import { createFileEpisodeCache, type EpisodeCache } from '@/downloads/episode-cache';
import { createExpoEngine, type EngineStatus, type PlayerEngine } from '@/player/engine';
import { confirmStreaming } from '@/player/stream-guard';

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
  /** Foreground/background signal. Faked in tests. */
  appState: { isActive(): boolean; subscribe(onChange: (active: boolean) => void): () => void };
  /** Called before streaming starts (e.g. the mobile-data prompt). Resolve false to cancel. */
  beforeStream: (episode: Episode) => Promise<boolean>;
  /** Temporary whole-episode cache ("cache whole episodes"). Absent where unsupported (web). */
  cache: EpisodeCache;
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
  const cache = deps.cache;
  const appState =
    deps.appState ??
    ({
      isActive: () => AppState.currentState === 'active',
      subscribe: (onChange) => {
        const sub = AppState.addEventListener('change', (s) => onChange(s === 'active'));
        return () => sub.remove();
      },
    } satisfies Deps['appState']);

  let loadedKey: string | null = null;
  let lastSavedSec = 0;
  // The true position and duration. The store's copies only follow these while the app is in the
  // foreground, so a screen-off listen doesn't re-render the UI (and wake JS) for nothing.
  let livePosition = 0;
  let liveDuration = 0;
  // For "auto restart sleep timer": the last minutes-based timer chosen, and when playback last paused.
  let lastSleepMinutes: number | null = null;
  let lastPauseAt: number | null = null;
  // Bumped by each play request so a slow mobile-data prompt can't start an outdated episode.
  let playRequest = 0;
  // Where a load that failed before playing began, so a retry doesn't back up (resume) again.
  let failedStart: number | null = null;
  // Last position observed while playing normally, to check the next one against the clock.
  let tick: { pos: number; at: number } | null = null;
  // After a runaway was caught: ignore positions until the player is back near `good`.
  let recovering: { good: number; until: number } | null = null;
  let sleepTimer: ReturnType<typeof setTimeout> | undefined;

  const store = create<PlayerData & Actions>()((set, get) => {
    const keyOf = () => {
      const c = get().current;
      return c ? episodeKey(c.podcast.id, c.episode.id) : null;
    };

    const persist = () => {
      const { current } = get();
      const write = current
        ? storage.setItem(STORAGE_KEY, JSON.stringify({ podcast: current.podcast, episode: current.episode, positionSec: livePosition }))
        : storage.removeItem(STORAGE_KEY);
      write.catch(() => {});
    };

    /** Write the position into the library; counts as played once near the end. */
    const saveProgress = () => {
      const { current } = get();
      const positionSec = livePosition;
      const key = keyOf();
      if (!current || !key) return;
      lastSavedSec = positionSec;
      const dur = liveDuration || current.episode.durationSec;
      if (isFinished(positionSec * 1000, dur)) {
        library.getState().patchEpisode(key, { played: true, progressMs: 0, lastPlayed: now() });
      } else {
        library.getState().patchEpisode(key, { progressMs: Math.round(positionSec * 1000), played: false, lastPlayed: now() });
      }
      persist();
    };

    const metaOf = (c: { podcast: Podcast; episode: Episode }) => ({
      title: c.episode.title,
      artist: c.podcast.title,
      artworkUrl: c.episode.artwork ?? c.podcast.artwork,
    });

    const maybeRestartSleep = () => {
      if (
        lastSleepMinutes !== null &&
        shouldRestartSleep({ enabled: settings.getState().autoRestartSleepTimer, minutes: lastSleepMinutes, lastPauseAt, now: now() })
      ) {
        get().setSleep({ minutes: lastSleepMinutes });
      }
    };

    const startPlayback = () => {
      maybeRestartSleep();
      engine.play();
    };

    /** Resume the loaded (paused) episode, a couple of seconds early if intelligent resume is on. */
    const resumeLoaded = () => {
      if (settings.getState().intelligentResume && livePosition > 0) {
        livePosition = resumeFrom(livePosition, true);
        tick = null;
        engine.seekTo(livePosition);
        if (appState.isActive()) set({ positionSec: livePosition });
      }
      startPlayback();
    };

    const clearSleepTimer = () => {
      if (sleepTimer) clearTimeout(sleepTimer);
      sleepTimer = undefined;
    };

    const stopForSleep = () => {
      // Clear the timer first: pausing emits a status update that would re-run checkSleep.
      clearSleepTimer();
      lastPauseAt = now();
      set({ sleep: null, playing: false });
      saveProgress();
      engine.pause();
    };

    /** The player jumped ahead faster than the clock allows: put the user back where they were. */
    const recoverFromRunaway = () => {
      const good = livePosition;
      tick = null;
      recovering = { good, until: now() + 5000 };
      set({ playing: false, buffering: false, ...(appState.isActive() ? { positionSec: good } : null) });
      engine.pause();
      engine.seekTo(good);
      saveProgress(); // saves the good position, never the runaway one
      useToast.getState().show('Playback glitched, so I paused it and kept your place.');
    };

    const finish = () => {
      const key = keyOf();
      const { current } = get();
      if (!current || !key) return;
      // Unload first so the status update from pausing is ignored rather than re-saved.
      loadedKey = null;
      clearSleepTimer();
      lastPauseAt = now();
      cache?.release(key); // finished: the temporary file is no longer needed
      library.getState().patchEpisode(key, { played: true, progressMs: 0, lastPlayed: now() });
      // Leave the episode selected but rewound, so pressing play again starts it over.
      livePosition = 0;
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
        failedStart = livePosition;
        set({ playing: false, buffering: false });
        useToast.getState().show("Couldn't play this episode. Check your connection and try again.");
        return;
      }
      if (recovering) {
        // Still catching up after a runaway: only trust positions near the restored spot.
        if (Math.abs(s.positionSec - recovering.good) <= 5) recovering = null;
        else if (now() < recovering.until) return;
        else recovering = null;
      }
      // Plausibility: the position can't advance faster than the clock allows.
      const t = now();
      if (s.loaded) {
        if (
          tick &&
          !isPlausibleAdvance({ fromSec: tick.pos, toSec: s.positionSec, wallSec: (t - tick.at) / 1000, rate: get().rate })
        ) {
          // Playing (or "finishing") far ahead of the clock is a runaway: put the user back.
          // An odd position from a paused player is just a stale event, so ignore it.
          if (s.playing || s.finished) recoverFromRunaway();
          return;
        }
        tick = { pos: s.positionSec, at: t };
      }
      const prevPlaying = get().playing;
      if (s.loaded) livePosition = s.positionSec;
      if (s.durationSec > 0) liveDuration = s.durationSec;
      // Only publish the position to React while visible; state changes always go through.
      const visible = appState.isActive();
      const next: Partial<PlayerData> = {};
      if (s.playing !== get().playing) next.playing = s.playing;
      if (s.buffering !== get().buffering) next.buffering = s.buffering;
      if (visible) {
        if (livePosition !== get().positionSec) next.positionSec = livePosition;
        const dur = liveDuration || get().durationSec;
        if (dur !== get().durationSec) next.durationSec = dur;
      }
      // Skip the update entirely when nothing changed, so background ticks notify nobody.
      if (Object.keys(next).length > 0) set(next);
      if (s.finished) {
        finish();
        return;
      }
      const c = get().current;
      const skipLast = c ? library.getState().subscriptions[c.podcast.id]?.overrides.skipLastSec ?? 0 : 0;
      if (s.playing && reachedSkipLast(s.positionSec, liveDuration || get().durationSec, skipLast)) {
        finish();
        return;
      }
      if (prevPlaying && !s.playing) lastPauseAt = now();
      checkSleep();
      if ((prevPlaying && !s.playing) || (s.playing && Math.abs(s.positionSec - lastSavedSec) >= SAVE_EVERY_SEC)) {
        saveProgress();
      }
    });

    // Back in the foreground: catch the UI up to where playback got to while it wasn't watching.
    appState.subscribe((active) => {
      if (active && get().current) set({ positionSec: livePosition, durationSec: liveDuration || get().durationSec });
    });

    const load = (episode: Episode, podcast: Podcast, startSec: number) => {
      const key = episodeKey(podcast.id, episode.id);
      const downloaded = library.getState().episodes[key]?.downloadedUri;
      const rate = settings.getState().playbackRate;
      engine.load(downloaded ?? cache?.uriFor(key) ?? episode.audioUrl, startSec, rate, metaOf({ podcast, episode }));
      loadedKey = key;
      tick = null;
      recovering = null;
      failedStart = null;
      lastSavedSec = startSec;
      livePosition = startSec;
      liveDuration = episode.durationSec;
      set({
        current: { podcast, episode },
        positionSec: startSec,
        durationSec: episode.durationSec,
        rate,
        buffering: true,
      });
    };

    /** Swap a streaming episode to its freshly cached file at the current position. */
    const swapToFile = (key: string, uri: string) => {
      const c = get().current;
      if (!c || loadedKey !== key || keyOf() !== key) return;
      const wasPlaying = get().playing;
      tick = null;
      engine.load(uri, livePosition, get().rate, metaOf(c));
      if (wasPlaying) engine.play();
    };

    const maybeCacheWhole = (episode: Episode, podcast: Podcast) => {
      const key = episodeKey(podcast.id, episode.id);
      if (!cache || !settings.getState().cacheWholeEpisodes) return;
      if (library.getState().episodes[key]?.downloadedUri || cache.uriFor(key)) return;
      cache.start(key, episode.audioUrl, (uri) => swapToFile(key, uri));
    };

    const beginPlayback = (episode: Episode, podcast: Podcast, startSec: number) => {
      const previous = keyOf();
      const key = episodeKey(podcast.id, episode.id);
      if (previous && previous !== key) cache?.release(previous);
      load(episode, podcast, startSec);
      startPlayback();
      persist();
      maybeCacheWhole(episode, podcast);
    };

    /** Run `go` now, or after the user OKs streaming over mobile data. */
    const whenStreamingAllowed = (episode: Episode, podcast: Podcast, go: () => void) => {
      const key = episodeKey(podcast.id, episode.id);
      const streaming = !library.getState().episodes[key]?.downloadedUri && !cache?.uriFor(key);
      if (!streaming || !deps.beforeStream) {
        go();
        return;
      }
      const request = ++playRequest;
      void deps.beforeStream(episode).then((ok) => {
        if (ok && request === playRequest) go();
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
            livePosition = saved.positionSec;
            liveDuration = saved.episode.durationSec;
            set({
              current: { podcast: saved.podcast, episode: saved.episode },
              positionSec: saved.positionSec,
              durationSec: saved.episode.durationSec,
            });
          }
        } catch {
          // Nothing to restore.
        }
        cache?.clear(); // the in-memory index is gone after a restart, so stale files go too
        set({ hydrated: true, rate: settings.getState().playbackRate });
      },

      play(episode, podcast) {
        const key = episodeKey(podcast.id, episode.id);
        if (loadedKey === key && keyOf() === key) {
          if (!get().playing) resumeLoaded();
          return;
        }
        if (get().playing) saveProgress();
        const state = library.getState().episodes[key] ?? emptyEpisodeState;
        const overrides = library.getState().subscriptions[podcast.id]?.overrides;
        // A finished episode replays from the top; otherwise pick up (a little early) where you were.
        const resuming = !state.played && state.progressMs > 0;
        const base = state.played ? (overrides?.skipFirstSec ?? 0) : startPosition(state.progressMs, overrides?.skipFirstSec ?? 0, episode.durationSec);
        const start = resuming ? resumeFrom(base, settings.getState().intelligentResume) : base;
        whenStreamingAllowed(episode, podcast, () => beginPlayback(episode, podcast, start));
      },

      toggle() {
        const { current, playing } = get();
        if (!current) return;
        if (playing) {
          get().pause();
          return;
        }
        if (loadedKey === keyOf()) {
          resumeLoaded();
          return;
        }
        // Restored from storage (or finished): load now, resuming from where it stopped.
        const key = episodeKey(current.podcast.id, current.episode.id);
        const state = library.getState().episodes[key] ?? emptyEpisodeState;
        const from = livePosition > 0 ? livePosition : startPosition(state.progressMs, 0, current.episode.durationSec);
        // A retry after a failed load reuses that load's start instead of backing up again.
        const start = failedStart ?? resumeFrom(from, settings.getState().intelligentResume);
        whenStreamingAllowed(current.episode, current.podcast, () => beginPlayback(current.episode, current.podcast, start));
      },

      pause() {
        if (!get().playing) return;
        lastPauseAt = now();
        engine.pause();
      },

      seekTo(sec) {
        const { current, durationSec } = get();
        if (!current) return;
        const target = clampSeek(sec, durationSec || current.episode.durationSec);
        livePosition = target;
        tick = null;
        set({ positionSec: target });
        if (loadedKey === keyOf()) engine.seekTo(target);
        saveProgress();
      },

      seekBy(delta) {
        get().seekTo(livePosition + delta);
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
        // Remember the length for "auto restart"; turning the timer off (or to end of episode) forgets it.
        lastSleepMinutes = opt !== null && opt !== 'episode' ? opt.minutes : null;
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

export const usePlayer = createPlayerStore({
  // Ask before streaming over mobile data (the setting lives in useSettings).
  beforeStream: () =>
    confirmStreaming(useSettings.getState().warnMobileData, () => useSettings.getState().set({ warnMobileData: false })),
  cache: createFileEpisodeCache(),
});
