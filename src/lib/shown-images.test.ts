import { markShown, wasShown } from './shown-images';

it('remembers what has been shown', () => {
  expect(wasShown('https://a/1.jpg')).toBe(false);
  markShown('https://a/1.jpg');
  expect(wasShown('https://a/1.jpg')).toBe(true);
  expect(wasShown(undefined)).toBe(false);
});

it('forgets the oldest once it is full', () => {
  markShown('first');
  for (let i = 0; i < 900; i++) markShown(`img-${i}`);
  expect(wasShown('first')).toBe(false);
  expect(wasShown('img-899')).toBe(true);
});
