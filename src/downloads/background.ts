import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';

import { notifier } from '@/notifications';

import { automation } from './auto';
import { useDownloads } from './download-manager';

const TASK = 'auto-downloads';

// Defined at import time (the OS may start the app headless just to run this).
if (Platform.OS !== 'web') {
  TaskManager.defineTask(TASK, async () => {
    try {
      await Promise.all([useLibrary.getState().hydrate(), useFeeds.getState().hydrate(), useSettings.getState().hydrate(), useDownloads.getState().hydrate()]);
      const podcasts = Object.values(useLibrary.getState().subscriptions)
        .filter((s) => s.overrides.autoDownload || s.overrides.notifications)
        .map((s) => s.podcast);
      if (podcasts.length) {
        await useFeeds.getState().refreshAll(podcasts, { onlyStale: true });
        await automation.run();
        await notifier.check();
      }
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Ask the OS to run the task about hourly (it decides when; the minimum is 15 minutes). */
export async function registerAutoDownloadTask(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 60 });
  } catch {
    // Background work is best effort; foreground checks still run.
  }
}
