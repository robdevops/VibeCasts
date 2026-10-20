import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ToastHost } from '@/components/ui/toast-host';
import { flushAllWrites } from '@/db/writer';
import { PlayerSheet } from '@/components/player/player-sheet';
import { startDownloadAutomation } from '@/downloads/auto';
import { registerAutoDownloadTask } from '@/downloads/background';
import { useDownloads } from '@/downloads/download-manager';
import { startNewEpisodeNotifications } from '@/notifications';
import { configureNotifications } from '@/notifications/platform';
import { playerLog } from '@/player/event-log';
import { useBookmarks } from '@/store/bookmarks';
import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';
import { usePlayer } from '@/store/player';
import { usePlaylists } from '@/store/playlists';
import { useSettings } from '@/store/settings';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useEffect(() => {
    void useLibrary.getState().hydrate();
    void useFeeds.getState().hydrate();
    void useBookmarks.getState().hydrate();
    void playerLog.hydrate();
    configureNotifications();
    // Tapping a new-episode notification opens that episode.
    const tap = Notifications.addNotificationResponseReceivedListener((r) => {
      const d = r.notification.request.content.data as { podcastId?: string; episodeId?: string } | undefined;
      if (d?.podcastId && d.episodeId) router.push({ pathname: '/episode', params: { podcastId: d.podcastId, episodeId: d.episodeId } });
    });
    void useDownloads.getState().hydrate();
    // Stores batch their writes; save everything as soon as the app leaves the foreground.
    const flush = AppState.addEventListener('change', (state) => state !== 'active' && flushAllWrites());
    void usePlaylists.getState().hydrate();
    // Settings first: the player restores with the saved playback speed.
    void useSettings.getState().hydrate().then(() => usePlayer.getState().hydrate());
    return () => {
      tap.remove();
      flush.remove();
    };
  }, []);

  // Keep the native splash up until the saved library has loaded, then show the app (never longer than 3 s).
  const libraryReady = useLibrary((s) => s.hydrated);
  const feedsReady = useFeeds((s) => s.hydrated);
  const settingsReady = useSettings((s) => s.hydrated);
  const ready = libraryReady && feedsReady && settingsReady;
  // Auto archive/download rules, once the saved library is in.
  useEffect(() => {
    if (!ready) return;
    void registerAutoDownloadTask();
    const stopDownloads = startDownloadAutomation();
    const stopNotifications = startNewEpisodeNotifications();
    return () => {
      stopDownloads();
      stopNotifications();
    };
  }, [ready]);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
    const t = setTimeout(() => void SplashScreen.hideAsync(), 3000);
    return () => {
      clearTimeout(t);
    };
  }, [ready]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="episode" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true }} />
        </Stack>
        <PlayerSheet />
        <ToastHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
