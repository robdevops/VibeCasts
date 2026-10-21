import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { Icon, type IconName } from './icon';

type Props = {
  name: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
};

export function IconButton({ name, label, onPress, color, size = 24, disabled }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}>
      <Icon name={name} size={size} color={color ?? theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
