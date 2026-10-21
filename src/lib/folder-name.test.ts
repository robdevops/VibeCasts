import { folderIdsByName, folderKey } from './folder-name';

describe('folder names', () => {
  it('compare without case or repeated spaces', () => {
    expect(folderKey('  True   Crime ')).toBe('true crime');
    expect(folderKey(undefined)).toBe('');
  });

  it('the first folder of a name wins', () => {
    const m = folderIdsByName([{ id: 'a', name: 'News' }, { id: 'b', name: 'news' }, { id: 'c', name: ' ' }]);
    expect(m.get('news')).toBe('a');
    expect(m.size).toBe(1);
  });
});
