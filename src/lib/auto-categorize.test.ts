import { planCategories } from './auto-categorize';

const p = (id: string, category?: string) => ({ id, category });

describe('planCategories', () => {
  it('groups by category, ignoring case and spacing, biggest group first', () => {
    const plan = planCategories([p('1', 'News'), p('2', ' news '), p('3', 'Comedy'), p('4', 'comedy'), p('5', 'Comedy'), p('6', 'Society  &  Culture'), p('7', 'Society & Culture')], []);
    expect(plan.groups.map((g) => [g.name, g.podcastIds])).toEqual([
      ['Comedy', ['3', '4', '5']],
      ['News', ['1', '2']],
      ['Society & Culture', ['6', '7']],
    ]);
    expect(plan.moved).toBe(7);
    expect(plan.leftLoose).toBe(0);
  });

  it('leaves a single show in a category, and shows without one, loose', () => {
    const plan = planCategories([p('1', 'News'), p('2', 'News'), p('3', 'Sports'), p('4'), p('5', '  ')], []);
    expect(plan.groups).toHaveLength(1);
    expect(plan.moved).toBe(2);
    expect(plan.leftLoose).toBe(3);
  });

  it('reuses a folder with the same name, even for a single show', () => {
    const plan = planCategories([p('1', 'Sports'), p('2', 'News'), p('3', 'News')], [{ id: 'f1', name: 'sports' }]);
    expect(plan.groups.find((g) => g.name === 'Sports')).toEqual({ name: 'Sports', folderId: 'f1', podcastIds: ['1'] });
    expect(plan.groups.find((g) => g.name === 'News')?.folderId).toBeUndefined();
  });

  it('can ask for a folder per category', () => {
    expect(planCategories([p('1', 'Sports')], [], 1).groups).toHaveLength(1);
  });

  it('does nothing for an empty library', () => {
    expect(planCategories([], [])).toEqual({ groups: [], leftLoose: 0, moved: 0 });
  });

  it('matches a folder named with extra spaces, and the first of two same-named folders', () => {
    const plan = planCategories([p('1', 'True Crime')], [{ id: 'a', name: 'True  Crime' }, { id: 'b', name: 'true crime' }]);
    expect(plan.groups[0].folderId).toBe('a');
  });
});
