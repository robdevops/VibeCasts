export type EpisodeState = {
  progressMs: number;
  played: boolean;
  starred: boolean;
  archived: boolean;
  downloadedUri?: string;
  /** When the download finished, epoch ms. */
  downloadedAt?: number;
  /** Fetched by auto download (so it may rotate off), as opposed to chosen by the user. */
  autoDownloaded?: boolean;
  /** When the episode became played, epoch ms (drives auto archive). */
  playedAt?: number;
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
  // The fixed tail only makes sense for real episodes; on a clip it would swallow most of it.
  const tail = durationSec >= 120 ? FINISH_TAIL_MS : 0;
  return progressMs >= durationMs * 0.95 || durationMs - progressMs <= tail;
}

/** 0..1 ring fill for an episode row. */
export function progressFraction(state: EpisodeState | undefined, durationSec: number): number {
  if (!state || state.played) return state?.played ? 1 : 0;
  if (durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, state.progressMs / (durationSec * 1000)));
}

/**
 * Fill of the ring around an episode's play button: a full ring when unplayed that shrinks as you
 * listen, so it shows the time that remains. Played episodes show a check instead (0).
 */
export function remainingFraction(state: EpisodeState | undefined, durationSec: number): number {
  if (state?.played) return 0;
  return 1 - progressFraction(state, durationSec);
}

export function timeLeftLabel(state: EpisodeState | undefined, durationSec: number): string {
  const leftSec = Math.max(0, durationSec - Math.floor((state?.progressMs ?? 0) / 1000));
  const m = Math.round(leftSec / 60);
  const label = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.max(m, leftSec > 0 ? 1 : 0)}m`;
  return state && state.progressMs > 0 && !state.played ? `${label} left` : label;
}

/** Episode state is keyed by `${podcastId}|${episodeId}`. */
export const episodeKey = (podcastId: string, episodeId: string) => `${podcastId}|${episodeId}`;

/** Episodes neither played nor archived. */
export function unplayedCount(
  podcastId: string,
  episodes: readonly { id: string }[],
  states: Record<string, EpisodeState | undefined>,
): number {
  let n = 0;
  for (const e of episodes) {
    const s = states[episodeKey(podcastId, e.id)];
    if (!s?.played && !s?.archived) n++;
  }
  return n;
}
