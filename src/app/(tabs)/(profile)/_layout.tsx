import { Stack } from 'expo-router';

// Without this the stack would open on whichever sub-page sorts first.
export const unstable_settings = { initialRouteName: 'profile' };

export default function StackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
