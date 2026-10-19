/** How far before the saved spot "intelligent resume" starts, in seconds. */
export const INTELLIGENT_RESUME_SEC = 2;

/** Where to resume from: a couple of seconds early so you hear the sentence you were in. */
export function resumeFrom(positionSec: number, intelligent: boolean): number {
  if (!intelligent || positionSec <= 0) return Math.max(0, positionSec);
  return Math.max(0, positionSec - INTELLIGENT_RESUME_SEC);
}

/** Resuming within this long after a pause re-arms the sleep timer (when the setting is on). */
export const SLEEP_RESTART_WINDOW_MS = 5 * 60_000;

export function shouldRestartSleep(args: {
  enabled: boolean;
  /** Length of the last minutes-based timer the user chose, if any. */
  minutes: number | null;
  lastPauseAt: number | null;
  now: number;
}): boolean {
  const { enabled, minutes, lastPauseAt, now } = args;
  return enabled && minutes !== null && lastPauseAt !== null && now - lastPauseAt <= SLEEP_RESTART_WINDOW_MS;
}

/** Ask before streaming when on mobile data. Downloaded or cached audio uses no data. */
export function needsMobileDataWarning(args: { warn: boolean; onMobileData: boolean; streaming: boolean }): boolean {
  return args.warn && args.onMobileData && args.streaming;
}

/**
 * Is a new playback position believable? While playing, the position can't advance faster than the
 * clock allows. A player that runs silently through the file (as can happen after the phone was
 * locked for a while) reports a jump far beyond that, and it must not be trusted or saved.
 */
export function isPlausibleAdvance(args: { fromSec: number; toSec: number; wallSec: number; rate: number }): boolean {
  const { fromSec, toSec, wallSec, rate } = args;
  // The flat 12 s covers the OS lock-screen skip buttons (a fixed 10 s) and timing jitter.
  const allowed = Math.max(0, wallSec) * Math.max(rate, 1) * 1.2 + 12;
  return toSec - fromSec <= allowed;
}

/** A position this far behind where we were, landing near the start, is a player that lost its place. */
export const REWIND_GUARD_SEC = 30;
const RESET_NEAR_START_SEC = 5;

/**
 * Did the player fall back to the start by itself? After a long screen-off the native player can
 * be reset and report 0:00. Our own seeks update the known position first, so an unexplained drop
 * of this kind is never the user (scrubbing elsewhere in the episode is not affected).
 */
export function isLostPlace(args: { knownSec: number; reportedSec: number }): boolean {
  return args.knownSec - args.reportedSec > REWIND_GUARD_SEC && args.reportedSec <= RESET_NEAR_START_SEC;
}
