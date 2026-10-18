import { contentHeight, metricsFor, nearCenter, slotAt, slotRect } from './grid';

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
