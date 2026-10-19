import NetInfo from '@react-native-community/netinfo';
import { getBatteryStateAsync, BatteryState } from 'expo-battery';
import { Platform } from 'react-native';

import type { Conditions } from '@/lib/downloads';

/** Current charging state and connection, for the "only when charging / on Wi-Fi" rules. */
export async function readConditions(): Promise<Conditions> {
  const [net, battery] = await Promise.all([
    NetInfo.fetch().catch(() => null),
    Platform.OS === 'web' ? Promise.resolve(BatteryState.UNKNOWN) : getBatteryStateAsync().catch(() => BatteryState.UNKNOWN),
  ]);
  const type = net?.isConnected === false ? 'none' : net?.type;
  const connection: Conditions['connection'] =
    type === 'none' ? 'none' : type === 'wifi' || type === 'ethernet' ? 'wifi' : type === 'cellular' ? 'cellular' : 'other';
  const expensive = net && 'details' in net && net.details && 'isConnectionExpensive' in net.details ? !!net.details.isConnectionExpensive : connection === 'cellular';
  return {
    charging: battery === BatteryState.CHARGING || battery === BatteryState.FULL,
    connection,
    metered: expensive,
  };
}
