import { AppState } from 'react-native';

import type { Podcast } from '@/api/types';
import { downloadAllowed, planAutoDownloads, shouldAutoArchive, shouldAutoDelete, type Conditions } from '@/lib/downloads';
import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';

import { readConditions } from './conditions';
import { useDownloads } from './download-manager';

type Deps = {
  library: Pick<typeof useLibrary, 'getState'>;
  feeds: Pick<typeof useFeeds, 'getState'>;
  settings: Pick<typeof useSettings, 'getState'>;
  downloads: Pick<typeof useDownloads, 'getState'>;
  conditions: () => Promise<Conditions>;
  now: () => number;
};

export function createAutomation(deps: Partial<Deps> = {}) {
  const library = deps.library ?? useLibrary;
  const feeds = deps.feeds ?? useFeeds;
  const settings = deps.settings ?? useSettings;
  const downloads = deps.downloads ?? useDownloads;
  const conditions = deps.conditions ?? readConditions;
  const now = deps.now ?? Date.now;

  /** Archive played episodes and delete their downloads, each per its own setting. */
  function runArchive() {
    const { autoArchive, autoArchiveStarred, autoDelete } = settings.getState();
    for (const [key, state] of Object.entries(library.getState().episodes)) {
      const [podcastId, ...rest] = key.split('|');
      const episodeId = rest.join('|');
      if (shouldAutoArchive(state, now(), autoArchive, autoArchiveStarred)) library.getState().patchEpisode(key, { archived: true });
      if (shouldAutoDelete(state, now(), autoDelete, autoArchiveStarred)) downloads.getState().remove(podcastId, episodeId);
    }
  }

  /** Keep the newest unplayed episodes of auto-download shows downloaded, when conditions allow. */
  async function runDownloads() {
    const { autoDownloadLimit, downloadOnlyCharging, downloadNetwork } = settings.getState();
    const subs = Object.values(library.getState().subscriptions).filter((s) => s.overrides.autoDownload);
    if (!subs.length) return;
    if (!downloadAllowed({ onlyWhenCharging: downloadOnlyCharging, network: downloadNetwork }, await conditions())) return;
    const states = library.getState().episodes;
    for (const sub of subs) {
      const episodes = feeds.getState().feeds[sub.podcast.id]?.episodes ?? [];
      const plan = planAutoDownloads({ podcastId: sub.podcast.id, episodes, states, limit: autoDownloadLimit });
      for (const e of plan.remove) downloads.getState().remove(sub.podcast.id, e.id);
      for (const e of plan.download) downloads.getState().download(e, sub.podcast as Podcast, { auto: true });
    }
  }

  async function run() {
    runArchive();
    await runDownloads();
  }

  return { run, runArchive, runDownloads };
}

export const automation = createAutomation();

function playedChanged(next: Record<string, { played: boolean }>, prev: Record<string, { played: boolean }>): boolean {
  if (next === prev) return false;
  for (const k in next) if (next[k].played !== !!prev[k]?.played) return true;
  return false;
}

/** Run the rules on foreground, after feeds refresh and when episodes change (debounced). */
export function startDownloadAutomation(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void automation.run().catch(() => {}), 2000);
  };
  const sub = AppState.addEventListener('change', (s) => s === 'active' && soon());
  const offFeeds = useFeeds.subscribe((s, p) => s.feeds !== p.feeds && soon());
  // Playback saves progress every few seconds; only react to an episode becoming played (or a
  // show's settings changing), so a screen-off listen doesn't keep waking this up.
  const offLib = useLibrary.subscribe((s, p) => {
    if (s.subscriptions !== p.subscriptions || playedChanged(s.episodes, p.episodes)) soon();
  });
  const offSettings = useSettings.subscribe((s, p) => {
    if (s.autoArchive !== p.autoArchive || s.autoArchiveStarred !== p.autoArchiveStarred || s.autoDownloadLimit !== p.autoDownloadLimit || s.downloadOnlyCharging !== p.downloadOnlyCharging || s.downloadNetwork !== p.downloadNetwork || s.autoDelete !== p.autoDelete) soon();
  });
  soon();
  return () => {
    clearTimeout(timer);
    sub.remove();
    offFeeds();
    offLib();
    offSettings();
  };
}
