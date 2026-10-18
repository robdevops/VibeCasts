import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof MaterialIcons>['name'];

export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color: string }) {
  return <MaterialIcons name={name} size={size} color={color} />;
}
