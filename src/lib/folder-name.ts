/** How folder names are compared (import, Auto categorize): case and runs of spaces don't matter. */
export const folderKey = (name: string | undefined): string => (name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The first folder of each name wins, so every caller agrees which of two same-named folders is meant. */
export function folderIdsByName(folders: { id: string; name: string }[]): Map<string, string> {
  const byName = new Map<string, string>();
  for (const f of folders) {
    const key = folderKey(f.name);
    if (key && !byName.has(key)) byName.set(key, f.id);
  }
  return byName;
}
