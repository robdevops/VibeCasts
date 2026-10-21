/**
 * Opening a folder or show from the grid zooms its tile towards you; leaving shrinks the page back into that tile. The
 * grid records where the tile was (centre and size, in window coordinates) when it is tapped; the page it opened takes
 * that record when it closes. Records are keyed by the page (`folder:<id>` / `podcast:<id>`) and kept as a stack, so a
 * show opened from inside a folder doesn't overwrite where the folder shrinks back to, and a page opened some other
 * way (no tile) simply finds none and does not shrink.
 */
export const FOLDER_ZOOM = true;
/** How long the zoom into a page takes (the route fades in `(podcasts)/_layout.tsx` match). */
export const ZOOM_MS = 500;
/**
 * The shrink back into the tile. The page fills the screen until it is nearly done, so with the same duration and an
 * ease-in-out it looks slower than the expand (where the tile has faded out before it finishes): shorter, and it starts fast.
 */
export const SHRINK_MS = 300;

/**
 * How a show opens from its tile: 'zoom' (the tile zooms towards you and fades, like a folder) or 'fly' (the tile's artwork
 * glides to the artwork on the show's page). Closing always flies the artwork back to the tile.
 */
export const PODCAST_OPEN: 'zoom' | 'fly' = 'zoom';

export type ZoomOrigin = { key: string; x: number; y: number; size: number };

const stack: ZoomOrigin[] = [];

export function pushZoomOrigin(o: ZoomOrigin): void {
  stack.push(o);
  if (stack.length > 8) stack.shift();
}

/** The most recent record for this page, removed from the stack (null if the page was not opened from a tile). */
export function takeZoomOrigin(key: string): ZoomOrigin | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].key === key) return stack.splice(i, 1)[0];
  }
  return null;
}
