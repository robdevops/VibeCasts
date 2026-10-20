import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { MenuSheet, type MenuItem } from '@/components/ui/menu-sheet';
import { useTheme } from '@/hooks/use-theme';
import { ARCHIVE_LABELS, NETWORK_LABELS, type ArchiveRule, type NetworkRule } from '@/lib/downloads';
import { useSettings } from '@/store/settings';

const LIMITS = Array.from({ length: 10 }, (_, i) => i + 1);

export function DownloadsSection() {
  const theme = useTheme();
  const s = useSettings();
  const [menu, setMenu] = useState<'archive' | 'delete' | 'network' | null>(null);

  const border = { borderBottomColor: theme.border };
  const archiveItems: MenuItem[] = (Object.keys(ARCHIVE_LABELS) as ArchiveRule[]).map((r) => ({
    label: ARCHIVE_LABELS[r],
    checked: s.autoArchive === r,
    onPress: () => {
      s.set({ autoArchive: r });
      setMenu(null);
    },
  }));
  const deleteItems: MenuItem[] = (Object.keys(ARCHIVE_LABELS) as ArchiveRule[]).map((r) => ({
    label: ARCHIVE_LABELS[r],
    checked: s.autoDelete === r,
    onPress: () => {
      s.set({ autoDelete: r });
      setMenu(null);
    },
  }));
  const networkItems: MenuItem[] = (Object.keys(NETWORK_LABELS) as NetworkRule[]).map((r) => ({
    label: NETWORK_LABELS[r],
    checked: s.downloadNetwork === r,
    onPress: () => {
      s.set({ downloadNetwork: r });
      setMenu(null);
    },
  }));

  const picker = (label: string, hint: string, value: string, which: 'archive' | 'delete' | 'network') => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={() => setMenu(which)} style={[styles.row, border]}>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText>{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" style={{ color: theme.accent }}>
        {value}
      </ThemedText>
      <Icon name="expand-more" size={20} color={theme.textSecondary} />
    </Pressable>
  );

  const toggle = (label: string, hint: string, value: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <View style={[styles.row, border, disabled && { opacity: 0.5 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText>{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: theme.accent }} accessibilityLabel={label} />
    </View>
  );

  const move = (d: number) => s.set({ autoDownloadLimit: LIMITS[Math.min(LIMITS.length - 1, Math.max(0, s.autoDownloadLimit - 1 + d))] });

  return (
    <View>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
        DOWNLOADS
      </ThemedText>
      {picker('Auto archive', 'Move played episodes to the archive.', ARCHIVE_LABELS[s.autoArchive], 'archive')}
      {picker('Auto delete', 'Delete the downloaded file of played episodes.', ARCHIVE_LABELS[s.autoDelete], 'delete')}
      {toggle('Include starred episodes', 'Starred episodes are kept unless this is on. Applies to auto archive and auto delete.', s.autoArchiveStarred, (v) => s.set({ autoArchiveStarred: v }), s.autoArchive === 'never' && s.autoDelete === 'never')}

      <View style={[styles.row, border]}>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText>Auto download limit</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Newest unplayed episodes kept downloaded for podcasts with auto download on. The oldest rotates off as new ones appear.
          </ThemedText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Decrease auto download limit" onPress={() => move(-1)} style={[styles.step, { borderColor: theme.border }]}>
          <Icon name="remove" size={20} color={theme.text} />
        </Pressable>
        <ThemedText type="smallBold" style={styles.value}>
          {s.autoDownloadLimit}
        </ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel="Increase auto download limit" onPress={() => move(1)} style={[styles.step, { borderColor: theme.border }]}>
          <Icon name="add" size={20} color={theme.text} />
        </Pressable>
      </View>

      {toggle('Only when charging', 'Automatic downloads wait until the phone is charging.', s.downloadOnlyCharging, (v) => s.set({ downloadOnlyCharging: v }))}
      {picker('Only on', 'Which connections may download automatically.', NETWORK_LABELS[s.downloadNetwork], 'network')}
      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        Automatic downloads run when you open the app and now and then in the background; Android and iOS decide when, so they can be late.
      </ThemedText>

      <MenuSheet visible={menu === 'archive'} items={archiveItems} title="Auto archive" onClose={() => setMenu(null)} />
      <MenuSheet visible={menu === 'delete'} items={deleteItems} title="Auto delete" onClose={() => setMenu(null)} />
      <MenuSheet visible={menu === 'network'} items={networkItems} title="Only on" onClose={() => setMenu(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6, letterSpacing: 0.8 },
  note: { paddingHorizontal: 16, paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  step: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 28, textAlign: 'center' },
});
