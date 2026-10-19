// Fake library for screenshots/dev on web: injected into localStorage before the app loads.
const COLORS = ['#C0392B', '#2E86C1', '#27AE60', '#8E44AD', '#D68910', '#16A085', '#2C3E50', '#E84393', '#6C5CE7', '#00A8A8'];
const NAMES = [
  'The Daily Brief', 'Global News Hour', 'Radio Davos', 'Checks and Balance', 'The Intelligence',
  'Space Matters', 'Money Puzzle', 'Deep History', 'Code & Coffee', 'Armchair Expert',
];

const art = (name, i) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="${COLORS[i % COLORS.length]}"/><text x="150" y="165" font-size="34" font-family="sans-serif" font-weight="700" fill="white" text-anchor="middle">${name.split(' ')[0]}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
};

const TITLES = [
  'Schrödinger’s chat: can AI and scientists co-exist?',
  'Who wants to be a millennial? Generation comeback',
  'The trouble with trade deals',
  'Why the oil price keeps surprising everyone',
  'A very short history of the pencil',
  'Inside the world’s quietest lab',
];
const episodes = (id, n) =>
  Array.from({ length: n }, (_, k) => ({
    id: `e${k}`, podcastId: id, title: TITLES[k % TITLES.length] + (k >= TITLES.length ? ` (part ${Math.floor(k / TITLES.length) + 1})` : ''),
    description: '<p>A conversation about <b>big ideas</b> &amp; small details.</p><p>Hosted by someone you know.</p>',
    audioUrl: 'x', published: 1_760_000_000_000 - k * 86_400_000 * 3, durationSec: 1200 + (k % 5) * 420,
  }));

export function seed({ unplayed = [99, 12, 3, 40, 7, 0, 20, 5, 1, 60] } = {}) {
  const subscriptions = {};
  const feeds = {};
  NAMES.forEach((name, i) => {
    const id = String(100 + i);
    subscriptions[id] = {
      podcast: { id, title: name, author: 'Author ' + (i + 1), artwork: art(name, i), feedUrl: `https://example.com/${id}.xml` },
      subscribedAt: 1_700_000_000_000 + i * 1000,
      overrides: {},
      ...(i >= 5 && i <= 8 ? { folderId: i <= 6 ? 'fa' : 'fb' } : {}),
    };
    feeds[id] = { fetchedAt: Date.now(), total: unplayed[i], episodes: episodes(id, unplayed[i]) };
  });
  // An unsubscribed show that was opened from Discovery (preview page).
  const preview = { id: '200', title: 'Machine Gods', author: 'NPR', artwork: art('Machine Gods', 3), feedUrl: 'https://example.com/200.xml', category: 'Technology' };
  feeds['200'] = { fetchedAt: Date.now(), total: 8, episodes: episodes('200', 8) };
  const library = {
    subscriptions,
    folders: {
      fa: { id: 'fa', name: 'News', color: '#F5B63A', createdAt: 1 },
      fb: { id: 'fb', name: 'Study', color: '#3AA0E8', createdAt: 2 },
    },
    homeOrder: ['f:fa', 'f:fb', 'p:100', 'p:101', 'p:102', 'p:103', 'p:104', 'p:109'],
    folderOrder: { fa: ['105', '106'], fb: ['107', '108'] },
    episodes: {
      '100|e0': { progressMs: 900_000, played: false, starred: true, archived: false, lastPlayed: 1_760_000_100_000 },
      '100|e1': { progressMs: 0, played: true, starred: false, archived: false, lastPlayed: 1_760_000_000_000 },
      '100|e2': { progressMs: 0, played: false, starred: false, archived: true },
      '100|e3': { progressMs: 1_620_000, played: false, starred: false, archived: false },
    },
    layout: 'tiles',
    sort: 'custom',
  };
  const nowPlaying = {
    podcast: subscriptions['100'].podcast,
    episode: feeds['100'].episodes[0],
    positionSec: 90,
  };
  const bookmarks = [{ id: 'b1', podcastId: '100', episodeId: 'e0', timeSec: 312, createdAt: 2 }, { id: 'b2', podcastId: '100', episodeId: 'e0', timeSec: 845, createdAt: 3 }];
  return {
    'library.v1': JSON.stringify(library),
    'feeds.v1': JSON.stringify({ feeds, known: { 200: preview } }),
    'player.v1': JSON.stringify(nowPlaying),
    'bookmarks.v1': JSON.stringify(bookmarks),
  };
}
