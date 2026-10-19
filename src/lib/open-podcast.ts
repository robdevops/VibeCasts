import { router } from 'expo-router';

import type { Podcast } from '@/api/types';
import { useFeeds } from '@/store/feeds';

/** Open a podcast's page from Discovery, remembering it so the page can resolve it by id. */
export function openDiscoveredPodcast(p: Podcast) {
  useFeeds.getState().remember(p);
  router.push({ pathname: '/(tabs)/(discovery)/podcast/[id]', params: { id: p.id } });
}
