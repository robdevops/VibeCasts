import { create } from 'zustand';

import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';

export type SettingsData = {
  skipBackSec: number;
  skipForwardSec: number;
  playbackRate: number;
  deleteOnFinish: boolean;
  downloadBeforePlay: boolean;
  wifiOnly: boolean;
};

const defaults: SettingsData = {
  skipBackSec: 15,
  skipForwardSec: 30,
  playbackRate: 1,
  deleteOnFinish: false,
  downloadBeforePlay: false,
  wifiOnly: false,
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
        if (raw) set({ ...defaults, ...(JSON.parse(raw) as Partial<SettingsData>) });
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
      downloadBeforePlay: s.downloadBeforePlay,
      wifiOnly: s.wifiOnly,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  });
  return store;
}

export const useSettings = createSettingsStore();
