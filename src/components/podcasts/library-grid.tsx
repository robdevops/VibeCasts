import { router } from 'expo-router';
import { useCallback, useMemo, type ReactNode } from 'react';
import { FlatList, RefreshControl } from 'react-native';

import { ELASTIC_SCROLL } from '@/constants/scroll';
import { confirmAsync } from '@/components/ui/confirm';
import { useTheme } from '@/hooks/use-theme';
import { useLibraryView } from '@/hooks/use-library-view';
import { parseKey } from '@/lib/layout';
import { useLibrary } from '@/store/library';

import { PodcastRow } from './podcast-row';
import { TileGrid, type GridItem } from './tile-grid';
import { FolderTile, PodcastTile } from './tiles';

type Props = {
  /** Tile keys in display order (`p:<id>` / `f:<id>`). */
  keys: string[];
  /** Set when showing a folder's members; changes what "remove" and reorder persist. */
  folderId?: string;
  layout: 'tiles' | 'list';
  canReorder: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  empty: ReactNode;
  onDragBegin?: (key: string) => void;
  onDragFinish?: () => void;
  onVisibleChange?: (range: { start: number; end: number }) => void;
};

/** The tile/list view shared by the Podcasts tab and folder pages. */
export function LibraryGrid({ keys, folderId, layout, canReorder, refreshing, onRefresh, empty, onDragBegin, onDragFinish, onVisibleChange }: Props) {
  const theme = useTheme();
  const view = useLibraryView();
  const { placeInHome, setFolderOrder, moveToFolder, removeFromFolder, unsubscribe, deleteFolder } = useLibrary.getState();

  const items = useMemo<GridItem[]>(
    () => keys.map((key) => ({ key, kind: parseKey(key).type })),
    [keys],
  );

  const open = useCallback((item: GridItem) => {
    const { id } = parseKey(item.key);
    if (item.kind === 'folder') router.push({ pathname: '/(tabs)/(podcasts)/folder/[id]', params: { id } });
    else router.push({ pathname: '/(tabs)/(podcasts)/podcast/[id]', params: { id } });
  }, []);

  const onRemove = useCallback(
    async (key: string) => {
      const { type, id } = parseKey(key);
      if (folderId) {
        removeFromFolder(id);
      } else if (type === 'podcast') {
        const title = view.subscriptions[id]?.podcast.title ?? 'this podcast';
        if (await confirmAsync('Unsubscribe?', `Remove ${title} from your library? Your progress will be kept.`, 'Unsubscribe')) {
          unsubscribe(id);
        }
      } else {
        const name = view.folders[id]?.name ?? 'this folder';
        // An empty folder has nothing to lose: delete it without asking.
        if (view.members(id).length === 0 || (await confirmAsync('Delete folder?', `Delete ${name}? Its podcasts go back to the main grid.`, 'Delete'))) {
          deleteFolder(id);
        }
      }
    },
    [deleteFolder, folderId, removeFromFolder, unsubscribe, view],
  );

  const onReorder = useCallback(
    (next: string[]) => {
      if (folderId) setFolderOrder(folderId, next.map((k) => parseKey(k).id));
      else placeInHome(next);
    },
    [folderId, setFolderOrder, placeInHome],
  );

  // What a tile shows, as a string: when it changes the tile re-renders, otherwise it is left alone.
  const itemVersion = (item: GridItem) => {
    const { id } = parseKey(item.key);
    if (item.kind === 'folder') {
      const f = view.folders[id];
      const art = view.members(id).slice(0, 4).map((p) => `${p.id}:${p.artwork}`).join(',');
      return `${f?.name}|${f?.color}|${view.folderUnplayed(id)}|${art}`;
    }
    const p = view.subscriptions[id]?.podcast;
    return `${p?.title}|${p?.artwork}|${view.unplayed[id] ?? 0}`;
  };

  const onDropIntoFolder = useCallback(
    (podcastKey: string, folderKey: string) => moveToFolder(parseKey(podcastKey).id, parseKey(folderKey).id),
    [moveToFolder],
  );

  if (layout === 'list') {
    return (
      <FlatList
        {...ELASTIC_SCROLL}
        data={items}
        keyExtractor={(i) => i.key}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        ListEmptyComponent={<>{empty}</>}
        contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
        renderItem={({ item }) => {
          const { id } = parseKey(item.key);
          if (item.kind === 'folder') {
            const folder = view.folders[id];
            if (!folder) return null;
            const members = view.members(id);
            return (
              <PodcastRow
                title={folder.name}
                subtitle={`${members.length} podcast${members.length === 1 ? '' : 's'}`}
                mosaic={members}
                unplayed={view.folderUnplayed(id)}
                onPress={() => open(item)}
              />
            );
          }
          const sub = view.subscriptions[id];
          if (!sub) return null;
          return (
            <PodcastRow
              title={sub.podcast.title}
              subtitle={sub.podcast.author}
              art={sub.podcast}
              unplayed={view.unplayed[id] ?? 0}
              onPress={() => open(item)}
            />
          );
        }}
      />
    );
  }

  return (
    <TileGrid
      items={items}
      canReorder={canReorder}
      onPress={open}
      onReorder={onReorder}
      onDropIntoFolder={folderId ? undefined : onDropIntoFolder}
      onRemove={onRemove}
      removeLabel={folderId ? 'Remove from folder' : 'Remove'}
      refreshing={refreshing}
      onRefresh={onRefresh}
      empty={empty}
      onDragBegin={onDragBegin}
      onDragFinish={onDragFinish}
      onVisibleChange={onVisibleChange}
      itemVersion={itemVersion}
      flightInfo={(item) => {
        const sub = view.subscriptions[parseKey(item.key).id];
        return sub ? { uri: sub.podcast.artwork, title: sub.podcast.title } : undefined;
      }}
      renderItem={(item, size) => {
        const { id } = parseKey(item.key);
        if (item.kind === 'folder') {
          const folder = view.folders[id];
          return folder ? (
            <FolderTile folder={folder} members={view.members(id)} unplayed={view.folderUnplayed(id)} size={size} />
          ) : null;
        }
        const sub = view.subscriptions[id];
        return sub ? <PodcastTile podcast={sub.podcast} unplayed={view.unplayed[id] ?? 0} size={size} /> : null;
      }}
    />
  );
}
