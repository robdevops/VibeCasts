import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { EmptyLibrary } from '@/components/podcasts/empty-library';
import { LibraryGrid } from '@/components/podcasts/library-grid';
import { ThemedView } from '@/components/themed-view';
import { confirmAsync } from '@/components/ui/confirm';
import { IconButton } from '@/components/ui/icon-button';
import { MenuSheet } from '@/components/ui/menu-sheet';
import { NamePrompt } from '@/components/ui/name-prompt';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/hooks/use-theme';
import { FOLDER_ZOOM, getZoomOrigin, SHRINK_MS } from '@/lib/folder-zoom';
import { useFeeds } from '@/store/feeds';
import { useLibrary } from '@/store/library';

export default function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const folder = useLibrary((s) => s.folders[id]);
  const order = useLibrary((s) => s.folderOrder[id]);
  const subscriptions = useLibrary((s) => s.subscriptions);
  const layout = useLibrary((s) => s.layout);
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Leaving: the whole page shrinks (and fades) into the folder tile it was opened from.
  const navigation = useNavigation();
  const rootRef = useRef<View>(null);
  const frame = useRef({ x: 0, y: 0, w: 1 });
  const exit = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const endScale = useSharedValue(1);
  const measure = () => rootRef.current?.measureInWindow((x, y, w) => (frame.current = { x, y, w: w || 1 }));
  useEffect(() => {
    if (!FOLDER_ZOOM) return;
    const start = () => {
      const o = getZoomOrigin();
      if (!o || exit.get() > 0) return;
      originX.set(o.x - frame.current.x);
      originY.set(o.y - frame.current.y);
      endScale.set(Math.max(0.05, o.size / frame.current.w));
      exit.set(withTiming(1, { duration: SHRINK_MS, easing: Easing.out(Easing.cubic) }));
    };
    const nav = navigation as unknown as { addListener(e: string, cb: (ev: { data?: { closing?: boolean } }) => void): () => void };
    // `beforeRemove` fires the moment going back is dispatched (before the native transition even starts), which is
    // sooner than `transitionStart`, so the shrink begins with the pop instead of a beat after it.
    const offBefore = nav.addListener('beforeRemove', start);
    const offTransition = nav.addListener('transitionStart', (e) => {
      if (e.data?.closing) start();
    });
    return () => {
      offBefore();
      offTransition();
    };
  }, [navigation, exit, originX, originY, endScale]);
  const shrinkStyle = useAnimatedStyle(() => {
    const p = exit.get();
    return { opacity: 1 - p * 0.6, transform: [{ scale: 1 + p * (endScale.get() - 1) }], transformOrigin: [originX.get(), originY.get(), 0] };
  });

  const keys = useMemo(() => (order ?? []).filter((p) => subscriptions[p]).map((p) => `p:${p}`), [order, subscriptions]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await useFeeds.getState().refreshAll((order ?? []).flatMap((p) => (subscriptions[p] ? [subscriptions[p].podcast] : [])));
    setRefreshing(false);
  }, [order, subscriptions]);

  if (!folder) {
    return (
      <ThemedView style={styles.fill}>
        <ScreenHeader title="Folder" back />
        <EmptyLibrary message="This folder no longer exists" showStarter={false} />
      </ThemedView>
    );
  }

  return (
    <Animated.View ref={rootRef} onLayout={measure} style={[styles.fill, shrinkStyle]}>
    <ThemedView style={styles.fill}>
      <ScreenHeader
        title={folder.name}
        back
        right={<IconButton name="more-vert" label="Folder options" color={theme.accent} onPress={() => setMenu(true)} />}
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
              if (await confirmAsync('Delete folder?', `Delete ${folder.name}? Its podcasts go back to the main grid.`, 'Delete')) {
                useLibrary.getState().deleteFolder(id);
                router.back();
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
