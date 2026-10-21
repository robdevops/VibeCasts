import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ELASTIC_SCROLL } from '@/constants/scroll';
import { ThemedView } from '@/components/themed-view';
import { Note, PickerRow, SectionTitle, ToggleRow } from '@/components/settings/rows';
import { MenuSheet, type MenuItem } from '@/components/ui/menu-sheet';
import { ScreenHeader } from '@/components/ui/screen-header';
import {
  HEADSET_BUTTONS,
  HEADSET_BUTTON_HINTS,
  HEADSET_BUTTON_LABELS,
  headsetActionLabel,
  headsetOptions,
  type HeadsetAction,
  type HeadsetButton,
} from '@/lib/headset';
import { useSettings, type SettingsData } from '@/store/settings';

const KEYS: Record<HeadsetButton, keyof SettingsData> = {
  skipForward: 'headsetSkipForward',
  skipBack: 'headsetSkipBack',
  seekForward: 'headsetSeekForward',
  seekBack: 'headsetSeekBack',
  playPause: 'headsetPlayPause',
};

export default function BluetoothSettingsScreen() {
  const s = useSettings();
  const [menu, setMenu] = useState<HeadsetButton | null>(null);

  const actionOf = (b: HeadsetButton) => s[KEYS[b]] as HeadsetAction;
  const labelOf = (b: HeadsetButton, a: HeadsetAction) => headsetActionLabel(b, a, s.skipBackSec, s.skipForwardSec);
  const items: MenuItem[] = menu
    ? headsetOptions(menu).map((a) => ({
        label: labelOf(menu, a),
        checked: actionOf(menu) === a,
        onPress: () => {
          s.set({ [KEYS[menu]]: a });
          setMenu(null);
        },
      }))
    : [];

  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader title="Bluetooth" back />
      <ScrollView {...ELASTIC_SCROLL}>
        <SectionTitle>HEADSET BUTTONS</SectionTitle>
        {HEADSET_BUTTONS.map((b) => (
          <PickerRow key={b} label={HEADSET_BUTTON_LABELS[b]} hint={HEADSET_BUTTON_HINTS[b]} value={labelOf(b, actionOf(b))} onPress={() => setMenu(b)} />
        ))}
        <Note>
          Seeks follow your skip lengths (Settings, Playback). Previous episode restarts the current one if it has played for more than 5 seconds. Next episode plays the next item in Up Next.
        </Note>
        <SectionTitle>LOCK SCREEN AND NOTIFICATION</SectionTitle>
        <ToggleRow label="Skip back button" hint="Show it on the lock screen and notification." value={s.lockScreenSkipBack} onChange={(v) => s.set({ lockScreenSkipBack: v })} />
        <ToggleRow label="Skip forward button" hint="Show it on the lock screen and notification." value={s.lockScreenSkipForward} onChange={(v) => s.set({ lockScreenSkipForward: v })} />
        <Note>These buttons skip by your skip lengths too. Button changes apply to the next track or the next time the controls appear. Headset buttons need an Android build that includes this feature.</Note>
      </ScrollView>
      <MenuSheet visible={menu !== null} items={items} title={menu ? HEADSET_BUTTON_LABELS[menu] : undefined} onClose={() => setMenu(null)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
