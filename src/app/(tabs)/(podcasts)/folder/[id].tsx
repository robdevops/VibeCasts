import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyLibrary } from '@/components/podcasts/empty-library';
import { LibraryGrid } from '@/components/podcasts/library-grid';
import { ThemedView } from '@/components/themed-view';
import { confirmAsync } from '@/components/ui/confirm';
import { IconButton } from '@/components/ui/icon-button';
import { MenuSheet } from '@/components/ui/menu-sheet';
import { NamePrompt } from '@/components/ui/name-prompt';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ZoomOutFrame } from '@/components/ui/zoom-out-frame';
import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';

export default function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const folder = useLibrary((s) => s.folders[id]);
  const order = useLibrary((s) => s.folderOrder[id]);
  const subscriptions = useLibrary((s) => s.subscriptions);
  const layout = useLibrary((s) => s.layout);
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const keys = useMemo(() => (order ?? []).filter((p) => subscriptions[p]).map((p) => `p:${p}`), [order, subscriptions]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await useFeeds.getState().refreshAll((order ?? []).flatMap((p) => (subscriptions[p] ? [subscriptions[p].podcast] : [])));
    setRefreshing(false);
  }, [order, subscriptions]);

  // The last show left (or the folder was deleted): the page has nothing to show, so it closes by itself.
  // Only when this page is the one showing (`router.back()` closes whatever is on top, which could be a show opened from here)
  // and only once the library has loaded (before that every folder looks missing, e.g. on a cold open or deep link).
  const hydrated = useLibrary((s) => s.hydrated);
  const focused = useIsFocused();
  const gone = hydrated && !folder;
  useEffect(() => {
    if (!gone || !focused) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/(podcasts)');
  }, [gone, focused]);

  if (!folder && !hydrated) return <ThemedView style={styles.fill} />; // the library is still loading

  if (!folder) {
    return (
      <ThemedView style={styles.fill}>
        <ScreenHeader title="Folder" back />
        <EmptyLibrary message="This folder no longer exists" showStarter={false} />
      </ThemedView>
    );
  }

  return (
    <ZoomOutFrame originKey={`folder:${id}`}>
    <ThemedView style={styles.fill}>
      <ScreenHeader
        title={folder.name}
        back
        ink={folder.color}
        right={<IconButton name="more-vert" label="Folder options" color={folder.color} onPress={() => setMenu(true)} />}
      />
      <View style={styles.fill}>
        <LibraryGrid
          keys={keys}
          folderId={id}
          layout={layout}
          canReorder
          refreshing={refreshing}
          onRefresh={refresh}
          empty={<EmptyLibrary message="This folder is empty" showStarter={false} />}
        />
      </View>
      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        items={[
          {
            label: 'Rename or recolour',
            icon: 'edit',
            onPress: () => {
              setMenu(false);
              setRename(true);
            },
          },
          {
            label: 'Delete folder',
            icon: 'delete-outline',
            destructive: true,
            onPress: async () => {
              setMenu(false);
              // An empty folder has nothing to lose: delete it without asking.
              if (keys.length === 0 || (await confirmAsync('Delete folder?', `Delete ${folder.name}? Its podcasts go back to the main grid.`, 'Delete'))) {
                useLibrary.getState().deleteFolder(id); // the page closes itself once the folder is gone
              }
            },
          },
        ]}
      />
      <NamePrompt
        visible={rename}
        title="Edit folder"
        confirmLabel="Save"
        initialName={folder.name}
        initialColor={folder.color}
        onCancel={() => setRename(false)}
        onSubmit={(name, color) => {
          useLibrary.getState().renameFolder(id, name, color);
          setRename(false);
        }}
      />
    </ThemedView>
    </ZoomOutFrame>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
