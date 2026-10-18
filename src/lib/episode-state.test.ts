import { isFinished, progressFraction, timeLeftLabel } from './episode-state';

const base = { progressMs: 0, played: false, starred: false, archived: false };

it('detects finished episodes', () => {
  expect(isFinished(960_000, 1000)).toBe(true);
  expect(isFinished(990_000, 1000)).toBe(true);
  expect(isFinished(500_000, 1000)).toBe(false);
  expect(isFinished(5, 0)).toBe(false);
});
it('computes ring fraction', () => {
  expect(progressFraction(undefined, 100)).toBe(0);
  expect(progressFraction({ ...base, progressMs: 25_000 }, 100)).toBe(0.25);
  expect(progressFraction({ ...base, played: true }, 100)).toBe(1);
});
it('labels time left', () => {
  expect(timeLeftLabel(undefined, 1620)).toBe('27m');
  expect(timeLeftLabel({ ...base, progressMs: 1_500_000 }, 1620)).toBe('2m left');
});
