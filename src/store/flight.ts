import { create } from 'zustand';

/**
 * The artwork of a show "flying" between its tile in the grid and the artwork on the show's page: when a show is opened the
 * tile glides to where the page's artwork is, and when the page closes it glides back. The grid starts it with the tile's
 * position, the page reports where its artwork is, and an overlay at the root draws the artwork in between.
 * Positions are in window coordinates; `size` is the width of the (square) artwork.
 */
export type FlightRect = { x: number; y: number; size: number };

export type FlightPhase = 'idle' | 'opening' | 'open' | 'closing';

type FlightData = {
  phase: FlightPhase;
  /** `podcast:<id>`: which show is flying. */
  key: string | null;
  uri?: string;
  title: string;
  from: FlightRect | null;
  to: FlightRect | null;
};

type Actions = {
  /**
   * The grid: a tile was tapped. With `fly` the artwork glides out to the page; without it the show opens some other way
   * (the tile zooms) and this only remembers where the tile is, so closing can fly the artwork back to it.
   */
  begin(key: string, uri: string | undefined, title: string, from: FlightRect, fly?: boolean): void;
  /** The page: where its artwork is. */
  setTarget(key: string, to: FlightRect): void;
  /** The overlay: the flight to the page has finished. */
  land(key: string): void;
  /** The page: it is closing (`to` is where its artwork is now; null if it is out of view, so there is nothing to fly). */
  close(key: string, to: FlightRect | null): void;
  /** The overlay: the flight back has finished (or was abandoned). */
  end(): void;
};

const idle: FlightData = { phase: 'idle', key: null, uri: undefined, title: '', from: null, to: null };

export const useFlight = create<FlightData & Actions>()((set, get) => ({
  ...idle,
  begin: (key, uri, title, from, fly = true) => set({ phase: fly ? 'opening' : 'open', key, uri, title, from, to: null }),
  setTarget: (key, to) => {
    const s = get();
    if (s.key === key && s.phase === 'opening' && !s.to) set({ to });
  },
  land: (key) => {
    const s = get();
    if (s.key === key && s.phase === 'opening') set({ phase: 'open' });
  },
  close: (key, to) => {
    const s = get();
    if (s.key !== key || (s.phase !== 'open' && s.phase !== 'opening')) return;
    if (!to || !s.from) set(idle);
    else set({ phase: 'closing', to });
  },
  end: () => set(idle),
}));
