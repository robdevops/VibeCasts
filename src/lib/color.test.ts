import { luminance, readableOn } from './color';

describe('readableOn', () => {
  it('uses dark text on light colours and white on dark ones', () => {
    expect(readableOn('#F5B63A')).toBe('#1B1B1F'); // yellow
    expect(readableOn('#FFFFFF')).toBe('#1B1B1F');
    expect(readableOn('#5B6BE0')).toBe('#FFFFFF'); // blue-violet
    expect(readableOn('#000')).toBe('#FFFFFF');
  });
  it('copes with short hex and nonsense', () => {
    expect(luminance('#fff')).toBeCloseTo(1, 2);
    expect(luminance('not a colour')).toBe(0.5);
  });
});
