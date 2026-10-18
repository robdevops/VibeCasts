export type EpisodeState = {
  progressMs: number;
  played: boolean;
  starred: boolean;
  archived: boolean;
  downloadedUri?: string;
  /** Last time the user listened, epoch ms (drives listening history). */
  lastPlayed?: number;
};

export const emptyEpisodeState: EpisodeState = {
  progressMs: 0,
  played: false,
  starred: false,
  archived: false,
};

/** Within this many ms of the end (or past 95%), an episode counts as finished. */
const FINISH_TAIL_MS = 15_000;

export function isFinished(progressMs: number, durationSec: number): boolean {
  if (durationSec <= 0) return false;
  const durationMs = durationSec * 1000;
  return progressMs >= durationMs * 0.95 || durationMs - progressMs <= FINISH_TAIL_MS;
}

/** 0..1 ring fill for an episode row. */
export function progressFraction(state: EpisodeState | undefined, durationSec: number): number {
  if (!state || state.played) return state?.played ? 1 : 0;
  if (durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, state.progressMs / (durationSec * 1000)));
}

export function timeLeftLabel(state: EpisodeState | undefined, durationSec: number): string {
  const leftSec = Math.max(0, durationSec - Math.floor((state?.progressMs ?? 0) / 1000));
  const m = Math.round(leftSec / 60);
  const label = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.max(m, leftSec > 0 ? 1 : 0)}m`;
  return state && state.progressMs > 0 && !state.played ? `${label} left` : label;
}
