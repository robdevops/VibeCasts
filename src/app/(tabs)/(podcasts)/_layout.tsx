import { Stack } from 'expo-router';

export default function StackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* The grid zooms towards you as the folder fades in (see TileGrid), so no sideways pan here. */}
      <Stack.Screen name="folder/[id]" options={{ animation: 'fade', animationDuration: 500 }} />
    </Stack>
  );
}
