import { create } from 'zustand';

import { kv } from '@/db/kv';
import type { KV } from '@/db/storage';
import type { ArchiveRule, NetworkRule } from '@/lib/downloads';

export type SettingsData = {
  skipBackSec: number;
  skipForwardSec: number;
  playbackRate: number;
  /** Delete the downloaded file of a played episode after this long (same periods as auto archive). */
  autoDelete: ArchiveRule;
  /** Resume 2 s before where you left off. */
  intelligentResume: boolean;
  /** Ask before streaming over mobile data. */
  warnMobileData: boolean;
  /** Re-arm the sleep timer when you resume within 5 minutes of the last pause. */
  autoRestartSleepTimer: boolean;
  /** Fetch the whole episode in one burst while streaming, then play from the file. */
  cacheWholeEpisodes: boolean;
  /** Archive played episodes automatically (and delete their downloads). */
  autoArchive: ArchiveRule;
  /** Also auto-archive starred episodes. */
  autoArchiveStarred: boolean;
  /** Episodes kept downloaded per podcast with auto download on (1-10). */
  autoDownloadLimit: number;
  /** Only download automatically while charging. */
  downloadOnlyCharging: boolean;
  /** Which connections may download automatically. */
  downloadNetwork: NetworkRule;
  /** Show the skip-back / skip-forward buttons on the lock screen, notification and headset controls. */
  lockScreenSkipBack: boolean;
  lockScreenSkipForward: boolean;
};

const defaults: SettingsData = {
  skipBackSec: 15,
  skipForwardSec: 30,
  playbackRate: 1,
  autoDelete: 'never',
  intelligentResume: true,
  warnMobileData: true,
  autoRestartSleepTimer: false,
  cacheWholeEpisodes: false,
  autoArchive: 'never',
  autoArchiveStarred: false,
  autoDownloadLimit: 3,
  downloadOnlyCharging: false,
  downloadNetwork: 'wifi',
  lockScreenSkipBack: true,
  lockScreenSkipForward: true,
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
          // "Delete episode when finished" became Auto delete > After playing.
          if ((saved as { deleteOnFinish?: boolean }).deleteOnFinish && saved.autoDelete === undefined) known.autoDelete = 'played';
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
      autoDelete: s.autoDelete,
      intelligentResume: s.intelligentResume,
      warnMobileData: s.warnMobileData,
      autoRestartSleepTimer: s.autoRestartSleepTimer,
      cacheWholeEpisodes: s.cacheWholeEpisodes,
      autoArchive: s.autoArchive,
      autoArchiveStarred: s.autoArchiveStarred,
      autoDownloadLimit: s.autoDownloadLimit,
      downloadOnlyCharging: s.downloadOnlyCharging,
      downloadNetwork: s.downloadNetwork,
      lockScreenSkipBack: s.lockScreenSkipBack,
      lockScreenSkipForward: s.lockScreenSkipForward,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  });
  return store;
}

export const useSettings = createSettingsStore();
