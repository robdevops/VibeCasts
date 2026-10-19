import { EpisodeListScreen } from '@/components/podcasts/episode-list-screen';

export default function HistoryScreen() {
  return (
    <EpisodeListScreen
      title="Listening history"
      emptyText="Episodes you listen to will show up here."
      include={(s) => !!s.lastPlayed}
      sortBy={(r) => r.state.lastPlayed ?? 0}
    />
  );
}
