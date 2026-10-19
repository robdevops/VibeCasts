import type { Episode, Podcast } from '@/api/types';
import { usePlayer } from '@/store/player';

/** Start (or resume) an episode. If it's the one already loaded, this just resumes playback. */
export function playEpisode(episode: Episode, podcast: Podcast): void {
  usePlayer.getState().play(episode, podcast);
}

/** Start an episode at a given position, e.g. from a bookmark. */
export function playEpisodeAt(episode: Episode, podcast: Podcast, positionSec: number): void {
  usePlayer.getState().play(episode, podcast);
  usePlayer.getState().seekTo(positionSec);
}

/** The play button on an episode row: pauses if that episode is playing, otherwise plays it. */
export function toggleEpisode(episode: Episode, podcast: Podcast): void {
  const { current, playing } = usePlayer.getState();
  const isCurrent = current?.episode.id === episode.id && current.podcast.id === podcast.id;
  if (isCurrent && playing) usePlayer.getState().pause();
  else usePlayer.getState().play(episode, podcast);
}
