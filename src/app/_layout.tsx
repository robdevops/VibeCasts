import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ToastHost } from '@/components/ui/toast-host';
import { prefetchTileArtwork } from '@/lib/prefetch-artwork';
import { playerLog } from '@/player/event-log';
import { useBookmarks } from '@/store/bookmarks';
import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';
import { usePlayer } from '@/store/player';
import { useSettings } from '@/store/settings';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useEffect(() => {
    void useLibrary.getState().hydrate();
    void useFeeds.getState().hydrate();
    void useBookmarks.getState().hydrate();
    void playerLog.hydrate();
    // Settings first: the player restores with the saved playback speed.
    void useSettings.getState().hydrate().then(() => usePlayer.getState().hydrate());
  }, []);

  // Keep the native splash up until the saved library has loaded, then show the app (never longer than 3 s).
  const libraryReady = useLibrary((s) => s.hydrated);
  const feedsReady = useFeeds((s) => s.hydrated);
  const settingsReady = useSettings((s) => s.hydrated);
  const ready = libraryReady && feedsReady && settingsReady;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
    const t = setTimeout(() => void SplashScreen.hideAsync(), 3000);
    // After first paint, fetch the grid's artwork into the image cache.
    const warm = ready
      ? setTimeout(() => {
          const subs = Object.values(useLibrary.getState().subscriptions);
          void prefetchTileArtwork(subs.map((x) => x.podcast.artwork));
        }, 600)
      : undefined;
    return () => {
      clearTimeout(t);
      if (warm) clearTimeout(warm);
    };
  }, [ready]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="episode" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true }} />
        </Stack>
        <ToastHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
