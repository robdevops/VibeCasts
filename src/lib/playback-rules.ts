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
