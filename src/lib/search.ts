/** Lowercase and drop accents, so "cafe" finds "Café". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A letter or digit in any script (no regex property escapes, which not every JS engine supports). */
const isWordChar = (c: string) => c.toLowerCase() !== c.toUpperCase() || (c >= '0' && c <= '9');

/**
 * Does `query` match at the start of a word in `text`? "me" matches "Metaverse" and "The Medical
 * Hour" but not "Games". The query may span words ("the dai" matches "The Daily Brief"); case,
 * accents and extra spaces are ignored, and punctuation counts as a word boundary.
 */
export function matchesWordStart(text: string, query: string): boolean {
  const q = fold(query).trim().replace(/\s+/g, ' ');
  if (!q) return true;
  const t = fold(text).replace(/\s+/g, ' ');
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + 1)) {
    if (i === 0 || !isWordChar(t[i - 1])) return true;
  }
  return false;
}

/**
 * Library search: the podcasts whose title or author has a word starting with the query. Title
 * matches come first, then author-only matches, each alphabetical. Returns podcast ids.
 */
export function searchPodcasts(podcasts: { id: string; title: string; author: string }[], query: string): string[] {
  const byTitle = [];
  const byAuthor = [];
  for (const p of podcasts) {
    if (matchesWordStart(p.title, query)) byTitle.push(p);
    else if (matchesWordStart(p.author, query)) byAuthor.push(p);
  }
  const alphabetical = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
  return [...byTitle.sort(alphabetical), ...byAuthor.sort(alphabetical)].map((p) => p.id);
}
