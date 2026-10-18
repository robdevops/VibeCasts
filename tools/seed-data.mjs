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
    feeds[id] = {
      fetchedAt: Date.now(),
      total: unplayed[i],
      episodes: Array.from({ length: unplayed[i] }, (_, n) => ({
        id: `e${n}`, podcastId: id, title: `Episode ${n}`, description: '', audioUrl: 'x', published: 1_760_000_000_000 - n * 86_400_000, durationSec: 1800,
      })),
    };
  });
  const library = {
    subscriptions,
    folders: {
      fa: { id: 'fa', name: 'News', color: '#F5B63A', createdAt: 1 },
      fb: { id: 'fb', name: 'Study', color: '#3AA0E8', createdAt: 2 },
    },
    homeOrder: ['f:fa', 'f:fb', 'p:100', 'p:101', 'p:102', 'p:103', 'p:104', 'p:109'],
    folderOrder: { fa: ['105', '106'], fb: ['107', '108'] },
    episodes: {},
    layout: 'tiles',
    sort: 'custom',
  };
  return { 'library.v1': JSON.stringify(library), 'feeds.v1': JSON.stringify({ feeds }) };
}
