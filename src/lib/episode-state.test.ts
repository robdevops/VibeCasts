import { isFinished, progressFraction, timeLeftLabel, unplayedCount } from './episode-state';

const base = { progressMs: 0, played: false, starred: false, archived: false };

it('detects finished episodes', () => {
  expect(isFinished(960_000, 1000)).toBe(true);
  expect(isFinished(990_000, 1000)).toBe(true);
  expect(isFinished(500_000, 1000)).toBe(false);
  expect(isFinished(5, 0)).toBe(false);
  // Short clips don't get the 15 s tail, only the 95% rule.
  expect(isFinished(3500, 6)).toBe(false);
  expect(isFinished(5800, 6)).toBe(true);
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

it('counts unplayed, skipping played and archived', () => {
  const eps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const states = {
    'p|a': { ...base, played: true },
    'p|b': { ...base, archived: true },
    'p|c': { ...base, progressMs: 10 },
  };
  expect(unplayedCount('p', eps, states)).toBe(2);
});
