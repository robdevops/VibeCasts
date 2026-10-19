/** Distance (px) or speed (px/s) a horizontal swipe needs before it changes tab. */
export const SWIPE_DISTANCE = 60;
export const SWIPE_VELOCITY = 600;

/**
 * The tab a horizontal swipe should switch to: swiping left moves to the next tab, right to the
 * previous. Returns null at either end, or when the gesture was too short or too slow.
 */
export function nextTab<T>(tabs: readonly T[], current: T, dx: number, vx: number): T | null {
  const far = Math.abs(dx) > SWIPE_DISTANCE;
  const fast = Math.abs(vx) > SWIPE_VELOCITY && Math.abs(dx) > 20 && Math.sign(vx) === Math.sign(dx);
  if (!far && !fast) return null;
  const i = tabs.indexOf(current);
  if (i < 0) return null;
  return tabs[i + (dx < 0 ? 1 : -1)] ?? null;
}
