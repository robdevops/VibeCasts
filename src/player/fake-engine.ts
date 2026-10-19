import type { EngineStatus, NowPlayingMeta, PlayerEngine } from './engine';

/** In-memory engine for tests: records calls and lets the test push status updates. */
export function createFakeEngine() {
  const listeners = new Set<(s: EngineStatus) => void>();
  const calls: string[] = [];
  const state = { uri: '', position: 0, duration: 1800, rate: 1, playing: false, meta: null as NowPlayingMeta | null };

  const status = (over: Partial<EngineStatus> = {}): EngineStatus => ({
    positionSec: state.position,
    durationSec: state.duration,
    playing: state.playing,
    buffering: false,
    loaded: true,
    finished: false,
    ...over,
  });
  const emit = (over?: Partial<EngineStatus>) => {
    // Like a real player, remember what was last reported so later events agree with it.
    if (over?.positionSec !== undefined) state.position = over.positionSec;
    if (over?.durationSec !== undefined) state.duration = over.durationSec;
    if (over?.playing !== undefined) state.playing = over.playing;
    listeners.forEach((l) => l(status(over)));
  };

  const engine: PlayerEngine = {
    load(uri, startSec, rate, meta) {
      calls.push(`load ${uri} @${startSec} x${rate}`);
      Object.assign(state, { uri, position: startSec, rate, meta, playing: false });
    },
    play() {
      calls.push('play');
      state.playing = true;
      emit();
    },
    pause() {
      calls.push('pause');
      state.playing = false;
      emit();
    },
    seekTo(sec) {
      calls.push(`seek ${sec}`);
      state.position = sec;
      emit();
    },
    setRate(rate) {
      calls.push(`rate ${rate}`);
      state.rate = rate;
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return { engine, calls, state, emit, fail: () => emit({ error: true, playing: false, loaded: false }) };
}
