import { useFlight } from './flight';

const from = { x: 10, y: 100, size: 110 };
const to = { x: 130, y: 60, size: 128 };
const s = () => useFlight.getState();

beforeEach(() => s().end());

describe('artwork flight', () => {
  it('flies out to the page, lands, then flies back and ends', () => {
    s().begin('podcast:1', 'art', 'Show', from);
    expect(s().phase).toBe('opening');
    s().setTarget('podcast:1', to);
    expect(s().to).toEqual(to);
    s().land('podcast:1');
    expect(s().phase).toBe('open');
    s().close('podcast:1', { x: 130, y: 70, size: 128 });
    expect(s().phase).toBe('closing');
    expect(s().to).toEqual({ x: 130, y: 70, size: 128 });
    s().end();
    expect(s().phase).toBe('idle');
    expect(s().key).toBeNull();
  });

  it('ignores reports for another show', () => {
    s().begin('podcast:1', 'art', 'Show', from);
    s().setTarget('podcast:2', to);
    expect(s().to).toBeNull();
    s().land('podcast:2');
    expect(s().phase).toBe('opening');
    s().close('podcast:2', to);
    expect(s().phase).toBe('opening');
  });

  it('only takes the first target', () => {
    s().begin('podcast:1', 'art', 'Show', from);
    s().setTarget('podcast:1', to);
    s().setTarget('podcast:1', { x: 0, y: 0, size: 1 });
    expect(s().to).toEqual(to);
  });

  it('closing with the artwork out of view just ends the flight', () => {
    s().begin('podcast:1', 'art', 'Show', from);
    s().setTarget('podcast:1', to);
    s().land('podcast:1');
    s().close('podcast:1', null);
    expect(s().phase).toBe('idle');
  });

  it('a page that was never opened from a tile has nothing to close', () => {
    s().close('podcast:9', to);
    expect(s().phase).toBe('idle');
  });

  it('without a flight out, it only remembers the tile and can still fly back', () => {
    s().begin('podcast:1', 'art', 'Show', from, false);
    expect(s().phase).toBe('open');
    s().close('podcast:1', to);
    expect(s().phase).toBe('closing');
    expect(s().from).toEqual(from);
  });
});
