import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Podcast } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { parseKey } from '@/lib/layout';
import { buildOpml, OpmlError, parseOpml, type OpmlFeed } from '@/lib/opml';
import { pickOpmlText, shareOpml } from '@/lib/opml-io';
import { previewImport, useLibrary, type ImportResult } from '@/store/library';

type State =
  | { step: 'idle' }
  | { step: 'preview'; feeds: OpmlFeed[]; skipped: number; counts: ReturnType<typeof previewImport> }
  | { step: 'done'; result: ImportResult; skipped: number }
  | { step: 'error'; message: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Export podcasts in display order, with folders nested, as OPML text. */
export function exportLibraryOpml(): string {
  const { homeOrder, subscriptions, folders, folderOrder } = useLibrary.getState();
  const podcasts: (Podcast & { folderId?: string })[] = [];
  const folderIds: string[] = [];
  for (const key of homeOrder) {
    const { type, id } = parseKey(key);
    if (type === 'podcast') {
      const s = subscriptions[id];
      if (s) podcasts.push({ ...s.podcast });
    } else if (folders[id]) {
      folderIds.push(id);
      for (const pid of folderOrder[id] ?? []) {
        const s = subscriptions[pid];
        if (s) podcasts.push({ ...s.podcast, folderId: id });
      }
    }
  }
  return buildOpml({ podcasts, folders, folderOrder: folderIds });
}

export function LibrarySection() {
  const theme = useTheme();
  const subscriptionCount = useLibrary((s) => Object.keys(s.subscriptions).length);
  const [state, setState] = useState<State>({ step: 'idle' });
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    setBusy(true);
    try {
      const text = await pickOpmlText();
      if (text === null) return;
      const parsed = parseOpml(text);
      setState({
        step: 'preview',
        feeds: parsed.feeds,
        skipped: parsed.skipped,
        counts: previewImport(parsed.feeds, useLibrary.getState().subscriptions),
      });
    } catch (e) {
      setState({ step: 'error', message: e instanceof OpmlError ? e.message : "Couldn't read that file." });
    } finally {
      setBusy(false);
    }
  };

  const doImport = (feeds: OpmlFeed[], skipped: number) => {
    const result = useLibrary.getState().importFeeds(feeds);
    setState({ step: 'done', result, skipped });
  };

  const doExport = async () => {
    setBusy(true);
    try {
      await shareOpml(exportLibraryOpml());
    } catch {
      setState({ step: 'error', message: "Couldn't export your podcasts." });
    } finally {
      setBusy(false);
    }
  };

  const button = (label: string, onPress: () => void, primary = false, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={[
        styles.button,
        primary ? { backgroundColor: theme.accent } : { borderColor: theme.border, borderWidth: 1.5 },
        (disabled || busy) && { opacity: 0.5 },
      ]}>
      <ThemedText type="smallBold" style={{ color: primary ? '#fff' : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );

  return (
    <View>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
        IMPORT & EXPORT
      </ThemedText>
      <View style={[styles.card, { borderBottomColor: theme.border }]}>
        <ThemedText>Import and export</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Move your podcasts to or from another app with an OPML file. Imported shows start with every episode unplayed.
        </ThemedText>

        {state.step === 'preview' ? (
          <View style={styles.block}>
            <ThemedText type="smallBold">
              {plural(state.counts.found, 'podcast')} found
              {state.counts.existing ? `, ${state.counts.existing} already in your library` : ''}
              {state.skipped ? `, ${state.skipped} skipped` : ''}
            </ThemedText>
            {state.counts.folders ? (
              <ThemedText type="small" themeColor="textSecondary">
                {plural(state.counts.folders, 'folder')} will be used to group them.
              </ThemedText>
            ) : null}
            <View style={styles.actions}>
              {button(`Import ${state.counts.fresh}`, () => doImport(state.feeds, state.skipped), true, state.counts.fresh === 0)}
              {button('Cancel', () => setState({ step: 'idle' }))}
            </View>
          </View>
        ) : null}

        {state.step === 'done' ? (
          <View style={styles.block} accessibilityLiveRegion="polite">
            <ThemedText type="smallBold">
              Added {plural(state.result.added, 'podcast')}
              {state.result.folders ? ` in ${plural(state.result.folders, 'new folder')}` : ''}.
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {state.result.existing ? `${state.result.existing} were already in your library. ` : ''}
              {state.skipped ? `${state.skipped} entries had no usable feed link. ` : ''}
              Artwork loads in the background; check the Podcasts tab.
            </ThemedText>
          </View>
        ) : null}

        {state.step === 'error' ? (
          <ThemedText type="small" style={{ color: theme.accent }} accessibilityLiveRegion="polite">
            {state.message}
          </ThemedText>
        ) : null}

        {state.step !== 'preview' ? (
          <View style={styles.actions}>
            {button('Import OPML…', choose, true)}
            {button('Export OPML…', doExport, false, subscriptionCount === 0)}
          </View>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          Some feeds contain private access links. Only share an exported file with people you trust.
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6, letterSpacing: 0.8 },
  card: { gap: 8, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  block: { gap: 4, paddingVertical: 4 },
  actions: { flexDirection: 'row', gap: 10, paddingVertical: 4, flexWrap: 'wrap' },
  button: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
});
