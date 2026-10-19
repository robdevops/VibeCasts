import type { Episode, Podcast } from '@/api/types';
import { useToast } from '@/store/toast';

/**
 * Playback entry point. Phase 4 replaces this with the real `expo-audio` player; until then the
 * play buttons exist but only tell the user playback is coming.
 */
export function playEpisode(_episode: Episode, _podcast: Podcast): void {
  useToast.getState().show('Playback arrives in the next phase');
}
