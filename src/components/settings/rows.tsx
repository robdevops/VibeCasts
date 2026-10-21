import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';

export const SKIP_STEPS = [5, 10, 15, 20, 30, 45, 60, 90];

export function SectionTitle({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
      {children}
    </ThemedText>
  );
}

export function Note({ children }: { children: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
      {children}
    </ThemedText>
  );
}

function Label({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <ThemedText>{label}</ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <Label label={label} hint={hint} />
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.accent }} accessibilityLabel={label} />
    </View>
  );
}

/** A row that shows the current choice and opens a menu (the parent owns the menu). */
export function PickerRow({ label, hint, value, onPress }: { label: string; hint?: string; value: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={[styles.row, { borderBottomColor: theme.border }]}>
      <Label label={label} hint={hint} />
      <ThemedText type="smallBold" style={{ color: theme.accent }}>
        {value}
      </ThemedText>
      <Icon name="expand-more" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

/** Seconds stepper over `SKIP_STEPS`. */
export function SecondsStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const theme = useTheme();
  const i = SKIP_STEPS.indexOf(value);
  const move = (d: number) => onChange(SKIP_STEPS[Math.min(SKIP_STEPS.length - 1, Math.max(0, (i < 0 ? 2 : i) + d))]);
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} onPress={() => move(-1)} style={[styles.step, { borderColor: theme.border }]}>
        <Icon name="remove" size={20} color={theme.text} />
      </Pressable>
      <ThemedText type="smallBold" style={styles.value}>
        {value}s
      </ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} onPress={() => move(1)} style={[styles.step, { borderColor: theme.border }]}>
        <Icon name="add" size={20} color={theme.text} />
      </Pressable>
    </View>
  );
}

/** A row that opens a sub-page. */
export function NavRow({ label, hint, href }: { label: string; hint?: string; href: Href }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(href)} style={[styles.row, { borderBottomColor: theme.border }]}>
      <Label label={label} hint={hint} />
      <Icon name="chevron-right" size={22} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6, letterSpacing: 0.8 },
  note: { paddingHorizontal: 16, paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  step: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 48, textAlign: 'center' },
});
