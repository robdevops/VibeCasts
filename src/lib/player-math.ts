/** 75 -> "1:15", 3723 -> "1:02:03". */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export const clampSeek = (sec: number, durationSec: number) =>
  Math.max(0, durationSec > 0 ? Math.min(sec, durationSec) : sec);

export const RATE_MIN = 0.5;
export const RATE_MAX = 3;
export const RATE_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

/** Step the rate by 0.1, staying within range and free of float noise. */
export function stepRate(rate: number, dir: 1 | -1): number {
  const next = Math.round((rate + dir * 0.1) * 10) / 10;
  return Math.min(RATE_MAX, Math.max(RATE_MIN, next));
}

export const formatRate = (rate: number) => `${Number.isInteger(rate) ? rate.toFixed(1) : rate}x`;

export const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60] as const;

/** Where playback starts: the saved spot, else past the intro the user wants skipped. */
export function startPosition(savedMs: number, skipFirstSec: number, durationSec: number): number {
  if (savedMs > 0) return savedMs / 1000;
  return durationSec > 0 ? Math.min(skipFirstSec, durationSec) : skipFirstSec;
}

/** Past the point where trailing seconds the user wants skipped begin. */
export function reachedSkipLast(positionSec: number, durationSec: number, skipLastSec: number): boolean {
  return skipLastSec > 0 && durationSec > 0 && positionSec >= durationSec - skipLastSec;
}

export function sleepLabel(endsAt: number, now: number): string {
  const min = Math.max(0, Math.ceil((endsAt - now) / 60000));
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;
}
