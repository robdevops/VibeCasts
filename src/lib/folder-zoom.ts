/**
 * Opening a folder zooms its tile towards you; leaving shrinks the folder page back into that tile. The grid records
 * where the tile was (centre and size, in window coordinates) when it is tapped, and the folder page reads it when it closes.
 */
export const FOLDER_ZOOM = true;
/** How long the zoom into a folder, and the shrink back out of it, take (the route fade in `(podcasts)/_layout.tsx` matches). */
export const ZOOM_MS = 500;

export type ZoomOrigin = { x: number; y: number; size: number };

let origin: ZoomOrigin | null = null;
export const setZoomOrigin = (o: ZoomOrigin | null): void => {
  origin = o;
};
export const getZoomOrigin = (): ZoomOrigin | null => origin;
