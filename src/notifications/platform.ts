import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { NotifyPlatform } from './notifier';

const CHANNEL = 'new-episodes';

/** Show notifications that arrive while the app is open too (they are hidden by default). */
export function configureNotifications() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  void Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'New episodes',
    importance: Notifications.AndroidImportance.DEFAULT,
  }).catch(() => {});
}

let permissionGranted = false; // once allowed, later toggles skip the native round trips (posting still checks `canPost`)

/** Ask for permission (Android 13+ and iOS prompt). Call from a user action, never in the background. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (permissionGranted) return true;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return (permissionGranted = true);
    if (!current.canAskAgain) return false;
    return (permissionGranted = (await Notifications.requestPermissionsAsync()).granted);
  } catch {
    return false;
  }
}

export function createDeviceNotifications(): NotifyPlatform | undefined {
  if (Platform.OS === 'web') return undefined;
  return {
    async canPost() {
      try {
        return (await Notifications.getPermissionsAsync()).granted;
      } catch {
        return false;
      }
    },
    async post(n) {
      await Notifications.scheduleNotificationAsync({
        identifier: n.id,
        content: { title: n.title, body: n.body, data: n.data },
        trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
      });
    },
  };
}
