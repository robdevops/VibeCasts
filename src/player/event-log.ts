import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';

const STORAGE_KEY = 'playerlog.v1';

/**
 * A short rolling record of what the player did, kept so a failure that happens overnight can be
 * explained afterwards. Only changes and decisions are logged (not every position tick).
 */
export type EventLog = {
  add(event: string, detail?: Record<string, string | number | boolean | undefined>): void;
  /** Load what was saved by the previous run (call once at startup). */
  hydrate(): Promise<void>;
  text(): string;
  clear(): void;
};

export function createEventLog(storage: KV = kv, now: () => number = Date.now, max = 200): EventLog {
  let lines: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stamp = (t: number) => new Date(t).toISOString().replace('T', ' ').slice(0, 19);
  const persistSoon = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      storage.setItem(STORAGE_KEY, JSON.stringify(lines)).catch(() => {});
    }, 2000);
  };

  return {
    add(event, detail) {
      const extra = detail
        ? ' ' +
          Object.entries(detail)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 10) / 10 : v}`)
            .join(' ')
        : '';
      lines.push(`${stamp(now())} ${event}${extra}`);
      if (lines.length > max) lines = lines.slice(lines.length - max);
      persistSoon();
    },
    async hydrate() {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        const saved = raw ? (JSON.parse(raw) as string[]) : [];
        // Earlier run first, then anything logged since startup.
        if (saved.length) lines = [...saved, '--- app started ---', ...lines].slice(-max);
      } catch {
        // No usable log; start fresh.
      }
    },
    text() {
      return lines.join('\n');
    },
    clear() {
      lines = [];
      storage.removeItem(STORAGE_KEY).catch(() => {});
    },
  };
}

export const playerLog = createEventLog();
