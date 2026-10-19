import * as Network from 'expo-network';
import { Alert, Platform } from 'react-native';

import { needsMobileDataWarning } from '@/lib/playback-rules';

export type DataChoice = 'allow' | 'always' | 'cancel';

/** True on a cellular connection. Failure to find out counts as "not on mobile data". */
export async function isOnMobileData(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await Network.getNetworkStateAsync()).type === Network.NetworkStateType.CELLULAR;
  } catch {
    return false;
  }
}

/** Three-way prompt: allow this time, always allow (stop asking) or cancel. */
export function askMobileData(): Promise<DataChoice> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm('You are on mobile data. Stream this episode anyway?') ? 'allow' : 'cancel');
  }
  return new Promise((resolve) => {
    Alert.alert(
      'Using mobile data',
      'Streaming this episode will use your mobile data.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
        { text: 'Always allow', onPress: () => resolve('always') },
        { text: 'Allow', onPress: () => resolve('allow') },
      ],
      { cancelable: true, onDismiss: () => resolve('cancel') },
    );
  });
}

type Deps = {
  isOnMobileData: () => Promise<boolean>;
  ask: () => Promise<DataChoice>;
};

/**
 * Decide whether streaming may start. Returns false when the user declines; "always allow" also
 * turns the warning off via `turnOffWarning`.
 */
export async function confirmStreaming(
  warn: boolean,
  turnOffWarning: () => void,
  { isOnMobileData: onMobile = isOnMobileData, ask = askMobileData }: Partial<Deps> = {},
): Promise<boolean> {
  if (!warn) return true;
  if (!needsMobileDataWarning({ warn, onMobileData: await onMobile(), streaming: true })) return true;
  const choice = await ask();
  if (choice === 'always') turnOffWarning();
  return choice !== 'cancel';
}
