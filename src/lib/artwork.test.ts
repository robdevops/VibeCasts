import { artworkLow, artworkSized } from './artwork';

describe('artworkSized', () => {
  const base = 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts/v4/ab/cd/ef/file.jpg';

  it('rewrites the size in iTunes artwork URLs, rounding up to a hundred', () => {
    expect(artworkSized(`${base}/600x600bb.jpg`, 330)).toBe(`${base}/400x400bb.jpg`);
    expect(artworkSized(`${base}/1400x1400bb.png`, 100)).toBe(`${base}/100x100bb.png`);
    expect(artworkSized(`${base}/100x100bb.jpg`, 400)).toBe(`${base}/400x400bb.jpg`);
  });

  it('leaves other hosts and unrecognised URLs alone', () => {
    expect(artworkSized('https://cdn.example.com/art/600x600bb.jpg', 300)).toBe('https://cdn.example.com/art/600x600bb.jpg');
    expect(artworkSized(`${base}/artwork`, 300)).toBe(`${base}/artwork`);
  });
});

describe('artworkLow', () => {
  it('asks iTunes for the smallest size', () => {
    expect(artworkLow('https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg')).toBe('https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg');
  });
  it('leaves other hosts alone', () => {
    expect(artworkLow('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
  });
});
