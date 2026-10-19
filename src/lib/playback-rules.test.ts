import { isPlausibleAdvance, needsMobileDataWarning, resumeFrom, shouldRestartSleep } from './playback-rules';

describe('resumeFrom', () => {
  it('steps back two seconds when on', () => {
    expect(resumeFrom(90, true)).toBe(88);
    expect(resumeFrom(1.5, true)).toBe(0);
  });
  it('leaves the position alone when off or at the start', () => {
    expect(resumeFrom(90, false)).toBe(90);
    expect(resumeFrom(0, true)).toBe(0);
  });
});

describe('shouldRestartSleep', () => {
  const base = { enabled: true, minutes: 30, lastPauseAt: 1_000_000, now: 1_000_000 + 4 * 60_000 };
  it('restarts within 5 minutes of the last pause', () => expect(shouldRestartSleep(base)).toBe(true));
  it('exactly at 5 minutes still counts', () => expect(shouldRestartSleep({ ...base, now: 1_000_000 + 300_000 })).toBe(true));
  it('does not after 5 minutes', () => expect(shouldRestartSleep({ ...base, now: 1_000_000 + 300_001 })).toBe(false));
  it('needs the setting, a remembered length and a pause', () => {
    expect(shouldRestartSleep({ ...base, enabled: false })).toBe(false);
    expect(shouldRestartSleep({ ...base, minutes: null })).toBe(false);
    expect(shouldRestartSleep({ ...base, lastPauseAt: null })).toBe(false);
  });
});

describe('needsMobileDataWarning', () => {
  it('warns only when enabled, on mobile data and streaming', () => {
    expect(needsMobileDataWarning({ warn: true, onMobileData: true, streaming: true })).toBe(true);
    expect(needsMobileDataWarning({ warn: false, onMobileData: true, streaming: true })).toBe(false);
    expect(needsMobileDataWarning({ warn: true, onMobileData: false, streaming: true })).toBe(false);
    expect(needsMobileDataWarning({ warn: true, onMobileData: true, streaming: false })).toBe(false);
  });
});

describe('isPlausibleAdvance', () => {
  it('accepts normal playback', () => {
    expect(isPlausibleAdvance({ fromSec: 100, toSec: 101, wallSec: 1, rate: 1 })).toBe(true);
    expect(isPlausibleAdvance({ fromSec: 100, toSec: 103, wallSec: 1, rate: 2 })).toBe(true);
  });
  it('accepts a long gap that matches the clock (JS was asleep while audio kept playing)', () => {
    expect(isPlausibleAdvance({ fromSec: 1200, toSec: 1200 + 3600, wallSec: 3600, rate: 1 })).toBe(true);
    expect(isPlausibleAdvance({ fromSec: 0, toSec: 7200, wallSec: 3600, rate: 2 })).toBe(true);
  });
  it('rejects running far ahead of the clock', () => {
    expect(isPlausibleAdvance({ fromSec: 1200, toSec: 3000, wallSec: 5, rate: 1 })).toBe(false);
    expect(isPlausibleAdvance({ fromSec: 1200, toSec: 1200 + 3600 * 2, wallSec: 3600, rate: 1 })).toBe(false);
  });
  it('accepts the lock-screen skip buttons (fixed 10 s jumps)', () => {
    expect(isPlausibleAdvance({ fromSec: 500, toSec: 510, wallSec: 0, rate: 1 })).toBe(true);
    expect(isPlausibleAdvance({ fromSec: 500, toSec: 490, wallSec: 0, rate: 1 })).toBe(true);
  });
  it('treats going backwards or standing still as fine', () => {
    expect(isPlausibleAdvance({ fromSec: 500, toSec: 400, wallSec: 1, rate: 1 })).toBe(true);
    expect(isPlausibleAdvance({ fromSec: 500, toSec: 500, wallSec: 10, rate: 1 })).toBe(true);
  });
});
