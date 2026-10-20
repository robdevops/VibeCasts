import { ScrollView, StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { SecondsStepper, ToggleRow } from '@/components/settings/rows';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useSettings } from '@/store/settings';

export default function PlaybackSettingsScreen() {
  const s = useSettings();
  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader title="Playback" back />
      <ScrollView>
        <SecondsStepper label="Skip back" value={s.skipBackSec} onChange={(v) => s.set({ skipBackSec: v })} />
        <SecondsStepper label="Skip forward" value={s.skipForwardSec} onChange={(v) => s.set({ skipForwardSec: v })} />
        <ToggleRow label="Intelligent resume" hint="Resume 2 seconds before where you left off." value={s.intelligentResume} onChange={(v) => s.set({ intelligentResume: v })} />
        <ToggleRow
          label="Warn when using mobile data"
          hint="Ask before streaming over mobile data, with options to allow once or always."
          value={s.warnMobileData}
          onChange={(v) => s.set({ warnMobileData: v })}
        />
        <ToggleRow
          label="Auto restart sleep timer"
          hint="If you resume within 5 minutes of the last pause, the sleep timer starts again."
          value={s.autoRestartSleepTimer}
          onChange={(v) => s.set({ autoRestartSleepTimer: v })}
        />
        <ToggleRow
          label="Cache whole episodes"
          hint="Download the whole episode as fast as possible while it plays, instead of keeping the radio awake to stream it. Saves battery; the temporary file is removed afterwards."
          value={s.cacheWholeEpisodes}
          onChange={(v) => s.set({ cacheWholeEpisodes: v })}
        />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
