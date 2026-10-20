import { AppState } from 'react-native';
import { create } from 'zustand';

import type { Episode, Podcast } from '@/api/types';
import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';
import { emptyEpisodeState, episodeKey, isFinished } from '@/lib/episode-state';
import { clampSeek, reachedSkipLast, startPosition } from '@/lib/player-math';
import { PREVIOUS_RESTART_SEC } from '@/lib/headset';
import { fromRef, toRef, type EpisodeRef } from '@/lib/playlist';
import { isLostPlace, isPlausibleAdvance, resumeFrom, shouldRestartSleep } from '@/lib/playback-rules';
import { createFileEpisodeCache, type EpisodeCache } from '@/downloads/episode-cache';
import { createExpoEngine, type EngineCommand, type EngineStatus, type PlayerEngine } from '@/player/engine';
import { playerLog, type EventLog } from '@/player/event-log';
import { confirmStreaming } from '@/player/stream-guard';

import { useLibrary } from './library';
import { usePlaylists } from './playlists';
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
  settings: Pick<typeof useSettings, 'getState' | 'subscribe'>;
  now: () => number;
  /** Foreground/background signal. Faked in tests. */
  appState: { isActive(): boolean; subscribe(onChange: (active: boolean) => void): () => void };
  /** Called before streaming starts (e.g. the mobile-data prompt). Resolve false to cancel. */
  beforeStream: (episode: Episode) => Promise<boolean>;
  /** Temporary whole-episode cache ("cache whole episodes"). Absent where unsupported (web). */
  cache: EpisodeCache;
  /** Rolling record of player events, for diagnosing failures after the fact. */
  log: EventLog;
  /** The Up Next queue: auto-advance takes from it, and starting an episode removes it from it. */
  queue: { take(): EpisodeRef | undefined; forget(key: string): void };
};

const STORAGE_KEY = 'player.v1';
/** How often (in played seconds) progress is written to the library while playing. */
const SAVE_EVERY_SEC = 5;
/** With the screen off nobody is watching, so progress is saved less often (fewer JS wake-ups and writes). */
const BACKGROUND_SAVE_EVERY_SEC = 20;
/** How long a load or recovery may take to reach the expected position before it is retried. */
const LOAD_GRACE_MS = 15_000;
/** After pressing play on a loaded episode, how long to wait for any sign of life from the player. */
const WAKE_CHECK_MS = 3000;
const HEARTBEAT_MS = 5 * 60_000;

export function createPlayerStore(deps: Partial<Deps> = {}) {
  const engine = deps.engine ?? createExpoEngine();
  const storage = deps.storage ?? kv;
  const library = deps.library ?? useLibrary;
  const settings = deps.settings ?? useSettings;
  const now = deps.now ?? Date.now;
  const cache = deps.cache;
  const log = deps.log ?? playerLog;
  const queue = deps.queue ?? { take: () => usePlaylists.getState().takeNext(), forget: (k: string) => usePlaylists.getState().forget(k) };
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
  // After a load or a recovery: the position we expect the player to reach. Until it does, whatever
  // it reports (typically 0:00 before the start seek applies) is ignored, never adopted or saved.
  let expecting: { pos: number; until: number; reloads: number } | null = null;
  // When a status that said "loaded" last arrived, and the timer that checks the player woke up.
  let lastLoadedAt = 0;
  let wakeCheck: ReturnType<typeof setTimeout> | undefined;
  let lastLogged = '';
  let lastBeat = 0;
  let sleepTimer: ReturnType<typeof setTimeout> | undefined;
  // Episodes played before the current one (newest last), for the headset "previous episode" action.
  const history: EpisodeRef[] = [];
  let goingBack = false;

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
    const saveProgress = (allowRewind = false) => {
      const { current } = get();
      const positionSec = livePosition;
      const key = keyOf();
      if (!current || !key) return;
      // Last line of defence: never write "back at the start" over a real place unless the user asked.
      if (!allowRewind && isLostPlace({ knownSec: lastSavedSec, reportedSec: positionSec })) return;
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
      log.add('play requested');
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
      // A player that was reset or killed in the background never answers: if nothing loaded
      // reports back soon after pressing play, load the episode again at the known place.
      const pressedAt = now();
      if (wakeCheck) clearTimeout(wakeCheck);
      wakeCheck = setTimeout(() => {
        wakeCheck = undefined;
        if (lastLoadedAt >= pressedAt || !get().current || loadedKey !== keyOf()) return;
        log.add('no-response', { pos: livePosition });
        reloadAt(livePosition, 1);
        engine.play();
      }, WAKE_CHECK_MS);
    };

    const clearSleepTimer = () => {
      if (sleepTimer) clearTimeout(sleepTimer);
      sleepTimer = undefined;
    };

    const stopForSleep = () => {
      log.add('sleep stop', { pos: livePosition, fg: appState.isActive() });
      // Clear the timer first: pausing emits a status update that would re-run checkSleep.
      clearSleepTimer();
      lastPauseAt = now();
      set({ sleep: null, playing: false });
      saveProgress();
      engine.pause();
    };

    const sourceFor = (key: string, episode: Episode) =>
      library.getState().episodes[key]?.downloadedUri ?? cache?.uriFor(key) ?? episode.audioUrl;

    /**
     * Put a fresh source on the player at `pos`, paused. A seek on a player that has lost its
     * source or been reset is dropped, but loading again applies the start position reliably.
     */
    const reloadAt = (pos: number, reloads: number) => {
      const c = get().current;
      const key = keyOf();
      if (!c || !key) return;
      tick = null;
      livePosition = pos;
      expecting = { pos, until: now() + LOAD_GRACE_MS, reloads };
      engine.load(sourceFor(key, c.episode), pos, get().rate, metaOf(c));
      loadedKey = key;
      log.add('reload', { pos, left: reloads });
    };

    /** The player jumped ahead faster than the clock allows: put the user back where they were. */
    const recoverFromRunaway = () => {
      const good = livePosition;
      log.add('runaway', { good });
      set({ playing: false, buffering: false, ...(appState.isActive() ? { positionSec: good } : null) });
      // Expect the place first, so the status the pause emits isn't judged against the old state.
      reloadAt(good, 1);
      engine.pause();
      saveProgress(); // saves the good position, never the runaway one
      useToast.getState().show('Playback glitched, so I paused it and kept your place.');
    };

    /** The player fell back to 0:00 on its own: keep the place we know and reload there. */
    const recoverFromLostPlace = (reported: number) => {
      const good = livePosition;
      log.add('lost-place', { good, reported });
      set({ playing: false, buffering: false, ...(appState.isActive() ? { positionSec: good } : null) });
      // Expect the place first, so the status the pause emits isn't judged against the old state.
      reloadAt(good, 1);
      engine.pause();
      useToast.getState().show('Playback was interrupted, so I paused it and kept your place.');
    };

    /** The reload didn't get back to the place either: stay paused; the next play loads afresh there. */
    const giveUpRecovering = () => {
      log.add('gave-up', { pos: livePosition });
      expecting = null;
      loadedKey = null;
      failedStart = livePosition;
      engine.pause();
      set({ playing: false, buffering: false, ...(appState.isActive() ? { positionSec: livePosition } : null) });
      useToast.getState().show("Couldn't restart playback, but your place is saved. Press play to try again.");
    };

    /** Log changes of player state (not every position tick), plus a slow heartbeat for long listens. */
    const logStatus = (s: EngineStatus) => {
      const sig = `${s.playing ? 'playing' : 'paused'} ${s.loaded ? 'loaded' : 'unloaded'}${s.buffering ? ' buffering' : ''}${s.error ? ' ERROR' : ''}`;
      const t = now();
      if (sig !== lastLogged || t - lastBeat >= HEARTBEAT_MS) {
        lastLogged = sig;
        lastBeat = t;
        log.add(sig, { pos: s.positionSec, dur: s.durationSec, fg: appState.isActive() });
      }
    };

    const finish = () => {
      const key = keyOf();
      const { current } = get();
      if (!current || !key) return;
      // "Stop at end of episode" means stop: don't roll on into the queue.
      const stopAtEnd = get().sleep?.kind === 'episode';
      // Unload first so the status update from pausing is ignored rather than re-saved.
      loadedKey = null;
      expecting = null;
      clearSleepTimer();
      lastPauseAt = now();
      log.add('finished');
      cache?.release(key); // finished: the temporary file is no longer needed
      library.getState().patchEpisode(key, { played: true, progressMs: 0, lastPlayed: now() });
      // Leave the episode selected but rewound, so pressing play again starts it over.
      livePosition = 0;
      set({ playing: false, positionSec: 0, sleep: null });
      engine.pause();
      persist();
      // Roll on into Up Next.
      const next = stopAtEnd ? undefined : queue.take();
      if (next) {
        const { episode, podcast } = fromRef(next);
        log.add('advance', { to: episode.id });
        get().play(episode, podcast);
      }
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
      if (s.loaded) {
        lastLoadedAt = now();
        if (wakeCheck) clearTimeout(wakeCheck);
        wakeCheck = undefined;
      }
      logStatus(s);
      if (expecting) {
        // Still getting to the position we asked for: only trust positions near it.
        if (s.loaded && Math.abs(s.positionSec - expecting.pos) <= 5) {
          expecting = null;
        } else {
          const t = now();
          if (t > expecting.until) {
            if (!s.loaded) expecting.until = t + LOAD_GRACE_MS; // still loading: keep waiting
            else if (expecting.reloads > 0) reloadAt(expecting.pos, expecting.reloads - 1);
            else giveUpRecovering();
          }
          // Play/pause and buffering still show, but this position is never adopted or saved.
          const flags: Partial<PlayerData> = {};
          if (s.playing !== get().playing && loadedKey) flags.playing = s.playing;
          if (s.buffering !== get().buffering) flags.buffering = s.buffering;
          if (Object.keys(flags).length > 0) set(flags);
          return;
        }
      }
      if (s.loaded && isLostPlace({ knownSec: livePosition, reportedSec: s.positionSec })) {
        recoverFromLostPlace(s.positionSec);
        return;
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
      if ((prevPlaying && !s.playing) || (s.playing && Math.abs(s.positionSec - lastSavedSec) >= (visible ? SAVE_EVERY_SEC : BACKGROUND_SAVE_EVERY_SEC))) {
        saveProgress();
      }
    });

    // Back in the foreground: catch the UI up to where playback got to while it wasn't watching.
    appState.subscribe((active) => {
      log.add(active ? 'app foreground' : 'app background', { pos: livePosition });
      if (active && get().current) set({ positionSec: livePosition, durationSec: liveDuration || get().durationSec });
    });

    const load = (episode: Episode, podcast: Podcast, startSec: number) => {
      const key = episodeKey(podcast.id, episode.id);
      const rate = settings.getState().playbackRate;
      const source = sourceFor(key, episode);
      engine.load(source, startSec, rate, metaOf({ podcast, episode }));
      // How it is being played: a downloaded file, the temporary cache, or streamed.
      const from = library.getState().episodes[key]?.downloadedUri ? 'download' : cache?.uriFor(key) ? 'cache' : 'stream';
      log.add('load', { startSec, rate, from });
      loadedKey = key;
      tick = null;
      expecting = startSec > 5 ? { pos: startSec, until: now() + LOAD_GRACE_MS, reloads: 1 } : null;
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
      expecting = livePosition > 5 ? { pos: livePosition, until: now() + LOAD_GRACE_MS, reloads: 1 } : null;
      engine.load(uri, livePosition, get().rate, metaOf(c));
      log.add('cache swap', { pos: livePosition, playing: wasPlaying });
      if (wasPlaying) engine.play();
    };

    const maybeCacheWhole = (episode: Episode, podcast: Podcast) => {
      const key = episodeKey(podcast.id, episode.id);
      if (!cache || !settings.getState().cacheWholeEpisodes) return;
      if (library.getState().episodes[key]?.downloadedUri || cache.uriFor(key)) return;
      log.add('cache start');
      cache.start(key, episode.audioUrl, (uri) => {
        log.add('cache ready');
        swapToFile(key, uri);
      });
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
        queue.forget(key); // playing it now takes it off the queue
        if (loadedKey === key && keyOf() === key) {
          if (!get().playing) resumeLoaded();
          return;
        }
        // Remember what was playing so "previous episode" can come back to it (not when that is how we got here).
        const before = get().current;
        if (before && episodeKey(before.podcast.id, before.episode.id) !== key && !goingBack) {
          history.push(toRef(before.episode, before.podcast));
          if (history.length > 20) history.shift();
        }
        goingBack = false;
        if (get().playing) {
          // Silence the old episode at once; the new one may take a moment to load (or wait on a data prompt).
          saveProgress();
          get().pause();
        }
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
        log.add('pause requested');
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
        // An explicit seek is the user's choice, even back to the start.
        expecting = null;
        saveProgress(true);
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
        log.add('sleep set', { timer: opt === null ? 'off' : opt === 'episode' ? 'end of episode' : `${opt.minutes} min` });
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

  // Lock-screen / headset skip buttons follow the settings (now and whenever they change).
  const applyButtons = () => {
    const s = settings.getState();
    engine.setLockScreenButtons({ back: s.lockScreenSkipBack, forward: s.lockScreenSkipForward });
    engine.setHeadsetControls({
      skipForward: s.headsetSkipForward,
      skipBack: s.headsetSkipBack,
      seekForward: s.headsetSeekForward,
      seekBack: s.headsetSeekBack,
      playPause: s.headsetPlayPause,
      forwardSec: s.skipForwardSec,
      backSec: s.skipBackSec,
    });
  };
  applyButtons();
  settings.subscribe(applyButtons);

  // What the system did to audio (focus loss, headphones leaving, button presses): written to the log only.
  engine.subscribeDiagnostics((kind, detail) => log.add(`native ${kind}`, { detail }));

  // Headset buttons set to "next / previous episode".
  engine.subscribeCommands((command: EngineCommand) => {
    log.add('headset', { command });
    if (command === 'nextEpisode') {
      const next = queue.take();
      if (!next) {
        useToast.getState().show('Nothing in Up Next.');
        return;
      }
      const { episode, podcast } = fromRef(next);
      store.getState().play(episode, podcast);
      return;
    }
    // Previous: restart this episode if it has played a while, otherwise go back to the one before it.
    const before = history.pop();
    if (livePosition > PREVIOUS_RESTART_SEC || !before) {
      if (before) history.push(before);
      store.getState().seekTo(0);
      return;
    }
    const { episode, podcast } = fromRef(before);
    goingBack = true;
    store.getState().play(episode, podcast);
  });

  return store;
}

export const usePlayer = createPlayerStore({
  // Ask before streaming over mobile data (the setting lives in useSettings).
  beforeStream: () =>
    confirmStreaming(useSettings.getState().warnMobileData, () => useSettings.getState().set({ warnMobileData: false })),
  cache: createFileEpisodeCache(),
});
