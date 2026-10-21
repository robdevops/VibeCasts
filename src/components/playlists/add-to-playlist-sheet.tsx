import { useState } from 'react';

import { MenuSheet, type MenuItem } from '@/components/ui/menu-sheet';
import { NamePrompt } from '@/components/ui/name-prompt';
import type { EpisodeRef } from '@/lib/playlist';
import { usePlaylists } from '@/store/playlists';
import { useToast } from '@/store/toast';

type Props = { visible: boolean; refs: EpisodeRef[]; onClose: () => void };

/** Choose a playlist (or make a new one) to add episodes to. */
export function AddToPlaylistSheet({ visible, refs, onClose }: Props) {
  const playlists = usePlaylists((s) => s.playlists);
  const [naming, setNaming] = useState(false);
  const count = refs.length === 1 ? 'episode' : `${refs.length} episodes`;

  const addTo = (id: string, name: string) => {
    usePlaylists.getState().addToPlaylist(id, refs);
    useToast.getState().show(`Added ${count} to ${name}`);
    onClose();
  };

  const items: MenuItem[] = [
    ...playlists.map((p) => ({ label: `${p.name} (${p.items.length})`, icon: 'queue-music' as const, onPress: () => addTo(p.id, p.name) })),
    { label: 'New playlist…', icon: 'playlist-add', separator: playlists.length > 0, onPress: () => setNaming(true) },
  ];

  return (
    <>
      <MenuSheet visible={visible && !naming} items={items} title="Add to playlist" onClose={onClose} />
      <NamePrompt
        visible={visible && naming}
        title="New playlist"
        confirmLabel="Create"
        onCancel={() => setNaming(false)}
        onSubmit={(name) => {
          const id = usePlaylists.getState().createPlaylist(name);
          setNaming(false);
          addTo(id, name.trim());
        }}
      />
    </>
  );
}
