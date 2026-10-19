import { EpisodeListScreen } from '@/components/podcasts/episode-list-screen';

export default function StarredScreen() {
  return (
    <EpisodeListScreen
      title="Starred"
      emptyText="Episodes you star will show up here."
      include={(s) => s.starred}
      sortBy={(r) => r.episode.published}
    />
  );
}
