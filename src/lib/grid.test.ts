import { contentHeight, metricsFor, nearCenter, slotAt, slotRect, visibleRange } from './grid';

const m = metricsFor(390); // pad 16, gap 12, 3 cols
const step = m.tile + m.gap;

it('computes tile size', () => {
  expect(m.tile).toBe(111);
});
it('places slots row-major', () => {
  expect(slotRect(0, m)).toEqual({ left: 16, top: 16, size: m.tile });
  expect(slotRect(4, m)).toEqual({ left: 16 + step, top: 16 + step, size: m.tile });
});
it('finds the slot under a point and clamps to the last slot', () => {
  expect(slotAt(20, 20, m, 7)).toBe(0);
  expect(slotAt(16 + step + 5, 20, m, 7)).toBe(1);
  expect(slotAt(20, 16 + step + 5, m, 7)).toBe(3);
  expect(slotAt(380, 900, m, 7)).toBe(6);
  expect(slotAt(0, 0, m, 0)).toBe(-1);
});
it('detects the centre zone', () => {
  const r = slotRect(0, m);
  expect(nearCenter(r.left + m.tile / 2, r.top + m.tile / 2, r)).toBe(true);
  expect(nearCenter(r.left + 2, r.top + 2, r)).toBe(false);
});
it('sizes content', () => {
  expect(contentHeight(7, m, 0)).toBe(16 + 3 * step);
});

describe('visibleRange', () => {
  const m = metricsFor(390); // 3 columns
  const step = m.tile + m.gap;

  it('mounts everything for small lists', () => {
    expect(visibleRange(0, 800, m, 9)).toEqual({ start: 0, end: 9 });
  });

  it('windows a long list around the scroll position, whole rows at a time', () => {
    const top = visibleRange(0, 800, m, 186);
    expect(top.start).toBe(0);
    expect(top.end).toBeLessThan(40);
    expect(top.end % m.cols).toBe(0);

    const mid = visibleRange(step * 20, 800, m, 186);
    expect(mid.start).toBeGreaterThan(40);
    expect(mid.start % m.cols).toBe(0);
    expect(mid.end - mid.start).toBeLessThan(45);
    expect(mid.start).toBeLessThanOrEqual(20 * m.cols);
    expect(mid.end).toBeGreaterThan(20 * m.cols);
  });

  it('clamps at the end', () => {
    expect(visibleRange(1e6, 800, m, 186).end).toBe(186);
  });
});
