export type CategoryGroup = { name: string; folderId?: string; podcastIds: string[] };
export type CategoryPlan = { groups: CategoryGroup[]; leftLoose: number; moved: number };

type Candidate = { id: string; category?: string };

const tidy = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Work out which loose podcasts go into which category folder. A category that already has a folder (same name, any
 * case) always goes there; a new folder is only made when at least `minGroup` shows share the category, so one-offs
 * stay loose. Biggest groups first, then by name.
 */
export function planCategories(loose: Candidate[], folders: { id: string; name: string }[], minGroup = 2): CategoryPlan {
  const folderByName = new Map<string, string>();
  for (const f of folders) {
    const key = tidy(f.name).toLowerCase();
    if (key && !folderByName.has(key)) folderByName.set(key, f.id);
  }
  const byCategory = new Map<string, CategoryGroup>();
  for (const p of loose) {
    const name = tidy(p.category);
    if (!name) continue;
    const key = name.toLowerCase();
    let group = byCategory.get(key);
    if (!group) byCategory.set(key, (group = { name, folderId: folderByName.get(key), podcastIds: [] }));
    group.podcastIds.push(p.id);
  }
  const groups = [...byCategory.values()].filter((g) => g.folderId || g.podcastIds.length >= minGroup);
  groups.sort((a, b) => b.podcastIds.length - a.podcastIds.length || a.name.localeCompare(b.name));
  const moved = groups.reduce((n, g) => n + g.podcastIds.length, 0);
  return { groups, leftLoose: loose.length - moved, moved };
}
