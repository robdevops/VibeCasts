export type GridMetrics = { cols: number; tile: number; gap: number; pad: number };
export type Rect = { left: number; top: number; size: number };

export function metricsFor(width: number, cols = 3, gap = 12, pad = 16): GridMetrics {
  const tile = Math.max(0, Math.floor((width - pad * 2 - gap * (cols - 1)) / cols));
  return { cols, tile, gap, pad };
}

export function slotRect(index: number, m: GridMetrics): Rect {
  const row = Math.floor(index / m.cols);
  const col = index % m.cols;
  return { left: m.pad + col * (m.tile + m.gap), top: m.pad + row * (m.tile + m.gap), size: m.tile };
}

export function contentHeight(count: number, m: GridMetrics, bottomPad = 24): number {
  const rows = Math.ceil(count / m.cols);
  return m.pad + rows * (m.tile + m.gap) + bottomPad;
}

/** Slot under a point (content coordinates). Points past the last slot map to the last slot. */
export function slotAt(x: number, y: number, m: GridMetrics, count: number): number {
  if (count <= 0) return -1;
  const step = m.tile + m.gap;
  const col = Math.min(m.cols - 1, Math.max(0, Math.floor((x - m.pad) / step)));
  const row = Math.max(0, Math.floor((y - m.pad) / step));
  return Math.min(count - 1, row * m.cols + col);
}

/** True when the point is within `frac` of the tile size from the tile centre (both axes). */
export function nearCenter(x: number, y: number, r: Rect, frac = 0.3): boolean {
  const cx = r.left + r.size / 2;
  const cy = r.top + r.size / 2;
  return Math.abs(x - cx) <= r.size * frac && Math.abs(y - cy) <= r.size * frac;
}

/**
 * Index range [start, end) of tiles worth mounting for a scroll position: the rows in view plus
 * `overscanRows` either side, so large libraries don't mount hundreds of gesture-wrapped tiles.
 */
export function visibleRange(scrollY: number, viewportH: number, m: GridMetrics, count: number, overscanRows = 2) {
  if (count <= 0 || m.tile <= 0) return { start: 0, end: Math.max(0, count) };
  const step = m.tile + m.gap;
  const first = Math.max(0, Math.floor((scrollY - m.pad) / step) - overscanRows);
  const last = Math.floor((scrollY + viewportH - m.pad) / step) + overscanRows;
  return { start: Math.min(count, first * m.cols), end: Math.min(count, (last + 1) * m.cols) };
}
