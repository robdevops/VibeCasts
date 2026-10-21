import { plural, stripHtml } from './text';

it('strips tags, keeps paragraph breaks and decodes entities', () => {
  expect(stripHtml('<p>Hello &amp; welcome</p><p>Second<br/>line</p>')).toBe('Hello & welcome\nSecond\nline');
});
it('renders list items as bullets', () => {
  expect(stripHtml('<ul><li>One</li><li>Two</li></ul>')).toBe('• One\n• Two');
});
it('decodes numeric entities and collapses blank lines', () => {
  expect(stripHtml('It&#8217;s<br><br><br><br>fine')).toBe('It’s\n\nfine');
});

it('treats missing show notes as empty instead of crashing', () => {
  expect(stripHtml(undefined)).toBe('');
  expect(stripHtml(null)).toBe('');
});

describe('plural', () => {
  it('says 1 podcast and 2 podcasts, and takes an irregular plural', () => {
    expect(plural(1, 'podcast')).toBe('1 podcast');
    expect(plural(0, 'podcast')).toBe('0 podcasts');
    expect(plural(2, 'person', 'people')).toBe('2 people');
  });
});
