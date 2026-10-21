/**
 * Image sources that have already been displayed this session. A tile that scrolls back into view
 * (and is mounted again) can then show its cached image at once instead of replaying the fade-in
 * over the placeholder, which reads as the art "redrawing".
 */
const shown = new Set<string>();
const MAX = 800;

export function markShown(source: string): void {
  if (shown.has(source)) return;
  if (shown.size >= MAX) {
    // Drop the oldest entry (Sets iterate in insertion order).
    const oldest = shown.values().next().value;
    if (oldest !== undefined) shown.delete(oldest);
  }
  shown.add(source);
}

export const wasShown = (source: string | undefined): boolean => !!source && shown.has(source);
