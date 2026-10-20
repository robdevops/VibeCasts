import { Stack } from 'expo-router';

// Opening straight onto a folder or show (a link, a restored session) still leaves the library underneath, so Back works.
export const unstable_settings = { initialRouteName: 'index' };

export default function StackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* The grid zooms towards you as the folder fades in (see TileGrid), so no sideways pan here. */}
      <Stack.Screen name="folder/[id]" options={{ animation: 'fade', animationDuration: 500 }} />
    </Stack>
  );
}
