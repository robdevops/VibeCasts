import { capabilitiesFor } from './podcast-capabilities';

it('greys out subscription-only controls for a preview', () => {
  const c = capabilitiesFor(false);
  expect(c).toMatchObject({
    subscribe: true, unsubscribe: false, notifications: false, autoDownload: false, skipSettings: false, folder: false,
  });
});
it('keeps listening controls available while previewing', () => {
  const c = capabilitiesFor(false);
  expect([c.search, c.sort, c.star, c.archive, c.markPlayed, c.share]).toEqual([true, true, true, true, true, true]);
});
it('enables everything but subscribe once subscribed', () => {
  const c = capabilitiesFor(true);
  expect(c).toMatchObject({ subscribe: false, unsubscribe: true, notifications: true, autoDownload: true, skipSettings: true, folder: true });
});
