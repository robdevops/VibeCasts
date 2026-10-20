/**
 * Opening a folder zooms its tile towards you; leaving shrinks the folder page back into that tile. The grid records
 * where the tile was (centre and size, in window coordinates) when it is tapped, and the folder page reads it when it closes.
 */
export const FOLDER_ZOOM = true;
/** How long the zoom into a folder takes (the route fade in `(podcasts)/_layout.tsx` matches). */
export const ZOOM_MS = 500;
/**
 * The shrink back into the tile. It fills the screen until it is nearly done, so with the same duration and an
 * ease-in-out it looks slower than the expand (where the tile has faded out before it finishes): shorter, and it starts fast.
 */
export const SHRINK_MS = 350;

export type ZoomOrigin = { x: number; y: number; size: number };

let origin: ZoomOrigin | null = null;
export const setZoomOrigin = (o: ZoomOrigin | null): void => {
  origin = o;
};
export const getZoomOrigin = (): ZoomOrigin | null => origin;
