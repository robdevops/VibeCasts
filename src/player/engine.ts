import Constants, { ExecutionEnvironment } from 'expo-constants';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { AppState, Platform } from 'react-native';

export type NowPlayingMeta = { title: string; artist: string; artworkUrl?: string };

export type EngineStatus = {
  positionSec: number;
  durationSec: number;
  playing: boolean;
  buffering: boolean;
  loaded: boolean;
  /** True on the status update that reports the end of the audio. */
  finished: boolean;
  /** Set when the source failed to load or play (offline, bad URL, unsupported file). */
  error?: boolean;
};

/** The slice of audio functionality the player store needs. Faked in tests. */
export interface PlayerEngine {
  /** Replace the source; playback stays paused until `play()`. */
  load(uri: string, startSec: number, rate: number, meta: NowPlayingMeta): void;
  play(): void;
  pause(): void;
  seekTo(sec: number): void;
  setRate(rate: number): void;
  /** Which skip buttons the lock screen, notification and headset controls offer. */
  setLockScreenButtons(buttons: { back: boolean; forward: boolean }): void;
  subscribe(listener: (s: EngineStatus) => void): () => void;
}

/**
 * How often the native player pushes status to JavaScript. Every update wakes the JS thread, which
 * costs battery during long listens (the interval is fixed when the player is created). Once a
 * second is plenty for a progress bar; the store stops publishing it to React in the background.
 */
export const STATUS_INTERVAL_MS = 1000;

/**
 * Seconds of audio the player buffers ahead of the playhead. Streaming fills this in a burst and
 * then lets the network idle, which cuts radio wake-ups and rides out short drops (e.g. while the
 * phone has been locked for a while) without the audio stopping.
 */
export const FORWARD_BUFFER_SEC = 600;

/**
 * Lock-screen controls on Android need a foreground media service that Expo Go's manifest does not
 * declare, so there they only work in a development/production build. (iOS Expo Go is fine.)
 */
const lockScreenSupported = !(
  Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient
);

export function createExpoEngine(): PlayerEngine {
  let player: AudioPlayer | null = null;
  let meta: NowPlayingMeta | null = null;
  let pendingSeek = 0;
  let pendingRate = 1;
  let applied = false;
  const listeners = new Set<(s: EngineStatus) => void>();
  let modeReady: Promise<void> | null = null;
  let buttons = { back: true, forward: true };

  const configureAudio = () =>
    (modeReady ??= setAudioModeAsync({
      playsInSilentMode: true,
      // Keep playing with the screen off / app in the background. Android additionally needs the
      // lock-screen session (below) or the OS stops audio after ~3 minutes.
      shouldPlayInBackground: true,
      // Required for the lock-screen / notification controls to attach to this player.
      interruptionMode: 'doNotMix',
    }).catch(() => undefined));

  // True once the lock-screen session has been started. From the background Android refuses to start the media
  // foreground service again ("startForeground() not allowed"), so there we only refresh what it shows.
  let lockActive = false;

  const activateLockScreen = () => {
    if (!player || !meta || !lockScreenSupported) return;
    try {
      if (lockActive && AppState.currentState !== 'active') {
        player.updateLockScreenMetadata({ title: meta.title, artist: meta.artist, albumTitle: meta.artist, artworkUrl: meta.artworkUrl });
        return;
      }
      lockActive = true;
      player.setActiveForLockScreen(
        true,
        { title: meta.title, artist: meta.artist, albumTitle: meta.artist, artworkUrl: meta.artworkUrl },
        { showSeekForward: buttons.forward, showSeekBackward: buttons.back },
      );
    } catch {
      // Lock-screen controls are a nicety; never let them break playback.
    }
  };

  const emitError = () => {
    const status: EngineStatus = { positionSec: 0, durationSec: 0, playing: false, buffering: false, loaded: false, finished: false, error: true };
    listeners.forEach((l) => l(status));
  };

  const ensurePlayer = () => {
    if (player) return player;
    player = createAudioPlayer(null, {
      updateInterval: STATUS_INTERVAL_MS,
      keepAudioSessionActive: true,
      preferredForwardBufferDuration: FORWARD_BUFFER_SEC,
    });
    player.addListener('playbackStatusUpdate', (s: AudioStatus) => {
      if (s.isLoaded && !applied) {
        // Seeking and rate changes issued before the source loads are dropped, so apply them now.
        applied = true;
        if (pendingSeek > 0) void player?.seekTo(pendingSeek);
        player?.setPlaybackRate(pendingRate);
      }
      if (/error|fail/i.test(s.playbackState)) {
        emitError();
        return;
      }
      const status: EngineStatus = {
        positionSec: s.currentTime,
        durationSec: s.duration,
        playing: s.playing,
        buffering: s.isBuffering,
        loaded: s.isLoaded,
        finished: s.didJustFinish,
      };
      listeners.forEach((l) => l(status));
    });
    return player;
  };

  return {
    load(uri, startSec, rate, nowPlaying) {
      void configureAudio();
      const p = ensurePlayer();
      meta = nowPlaying;
      pendingSeek = startSec;
      pendingRate = rate;
      applied = false;
      p.replace({ uri });
    },
    play() {
      const p = ensurePlayer();
      void configureAudio().then(() => {
        activateLockScreen();
        // On web play() returns a promise that rejects for unplayable sources.
        Promise.resolve(p.play() as unknown).catch(() => emitError());
      });
    },
    pause() {
      player?.pause();
    },
    seekTo(sec) {
      pendingSeek = sec;
      if (player) void player.seekTo(Math.max(0, sec));
    },
    setRate(rate) {
      pendingRate = rate;
      player?.setPlaybackRate(rate);
    },
    setLockScreenButtons(next) {
      if (next.back === buttons.back && next.forward === buttons.forward) return;
      buttons = next;
      // Re-apply to a session that is already showing controls.
      if (applied) activateLockScreen();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
