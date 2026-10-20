import type { KV } from './storage';

/** Every writer registers here so the app can flush them all when it goes to the background. */
const writers = new Set<{ flush(): void }>();

export function flushAllWrites() {
  writers.forEach((w) => w.flush());
}

/**
 * Coalesces writes to one storage key. Stores can change many times a second (playback progress,
 * a refresh of every feed) and each write serialises the whole value, so changes are batched:
 * `schedule` takes how long it may wait, and an already-pending earlier deadline is never pushed
 * back. `flush` writes immediately (call it when the app is backgrounded).
 */
export function createWriter(storage: KV, key: string, now: () => number = Date.now) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dueAt = 0;
  let serialize: (() => string) | null = null;

  const writer = {
    schedule(next: () => string, delayMs: number) {
      serialize = next; // always write the latest state
      const due = now() + delayMs;
      if (timer && dueAt <= due) return;
      clearTimeout(timer);
      dueAt = due;
      timer = setTimeout(writer.flush, delayMs);
    },
    flush() {
      clearTimeout(timer);
      timer = undefined;
      const fn = serialize;
      serialize = null;
      if (fn) storage.setItem(key, fn()).catch(() => {});
    },
  };
  writers.add(writer);
  return writer;
}
