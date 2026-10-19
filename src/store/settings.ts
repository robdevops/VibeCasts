import { create } from 'zustand';

import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';

export type SettingsData = {
  skipBackSec: number;
  skipForwardSec: number;
  playbackRate: number;
  deleteOnFinish: boolean;
  /** Resume 2 s before where you left off. */
  intelligentResume: boolean;
  /** Ask before streaming over mobile data. */
  warnMobileData: boolean;
  /** Re-arm the sleep timer when you resume within 5 minutes of the last pause. */
  autoRestartSleepTimer: boolean;
  /** Fetch the whole episode in one burst while streaming, then play from the file. */
  cacheWholeEpisodes: boolean;
};

const defaults: SettingsData = {
  skipBackSec: 15,
  skipForwardSec: 30,
  playbackRate: 1,
  deleteOnFinish: false,
  intelligentResume: true,
  warnMobileData: true,
  autoRestartSleepTimer: false,
  cacheWholeEpisodes: false,
};

type Actions = { hydrated: boolean; hydrate(): Promise<void>; set(patch: Partial<SettingsData>): void };

const STORAGE_KEY = 'settings.v1';

export function createSettingsStore(storage: KV = kv) {
  const store = create<SettingsData & Actions>()((set) => ({
    ...defaults,
    hydrated: false,
    async hydrate() {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<SettingsData>;
          // Keep only known keys so settings that no longer exist (e.g. wifiOnly) are dropped.
          const known = Object.fromEntries(Object.entries(saved).filter(([k]) => k in defaults));
          set({ ...defaults, ...known });
        }
      } catch {
        // Fall back to defaults.
      }
      set({ hydrated: true });
    },
    set: (patch) => set(patch),
  }));

  store.subscribe((s) => {
    if (!s.hydrated) return;
    const data: SettingsData = {
      skipBackSec: s.skipBackSec,
      skipForwardSec: s.skipForwardSec,
      playbackRate: s.playbackRate,
      deleteOnFinish: s.deleteOnFinish,
      intelligentResume: s.intelligentResume,
      warnMobileData: s.warnMobileData,
      autoRestartSleepTimer: s.autoRestartSleepTimer,
      cacheWholeEpisodes: s.cacheWholeEpisodes,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  });
  return store;
}

export const useSettings = createSettingsStore();
