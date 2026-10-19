import { clampSeek, formatClock, formatRate, reachedSkipLast, sleepLabel, startPosition, stepRate } from './player-math';

it('formats clocks', () => {
  expect(formatClock(0)).toBe('0:00');
  expect(formatClock(75)).toBe('1:15');
  expect(formatClock(3723.9)).toBe('1:02:03');
  expect(formatClock(-5)).toBe('0:00');
});
it('clamps seeks', () => {
  expect(clampSeek(-3, 100)).toBe(0);
  expect(clampSeek(150, 100)).toBe(100);
  expect(clampSeek(150, 0)).toBe(150);
});
it('steps the rate within bounds without float noise', () => {
  expect(stepRate(1, 1)).toBe(1.1);
  expect(stepRate(1.2, 1)).toBe(1.3);
  expect(stepRate(0.5, -1)).toBe(0.5);
  expect(stepRate(3, 1)).toBe(3);
  expect(formatRate(1)).toBe('1.0x');
  expect(formatRate(1.25)).toBe('1.25x');
});
it('chooses a start position', () => {
  expect(startPosition(90_000, 10, 1800)).toBe(90);
  expect(startPosition(0, 10, 1800)).toBe(10);
  expect(startPosition(0, 10, 5)).toBe(5);
});
it('detects the skip-last zone', () => {
  expect(reachedSkipLast(1790, 1800, 15)).toBe(true);
  expect(reachedSkipLast(1700, 1800, 15)).toBe(false);
  expect(reachedSkipLast(1799, 1800, 0)).toBe(false);
});
it('labels the sleep countdown', () => {
  expect(sleepLabel(10 * 60_000, 0)).toBe('10m');
  expect(sleepLabel(61 * 60_000, 0)).toBe('1h 1m');
});
