import { confirmStreaming } from './stream-guard';

jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn(), NetworkStateType: { CELLULAR: 'CELLULAR' } }));

const off = jest.fn();
beforeEach(() => off.mockClear());

it('does not even check the network when the warning is off', async () => {
  const onMobile = jest.fn();
  expect(await confirmStreaming(false, off, { isOnMobileData: onMobile })).toBe(true);
  expect(onMobile).not.toHaveBeenCalled();
});

it('lets Wi-Fi through without asking', async () => {
  const ask = jest.fn();
  expect(await confirmStreaming(true, off, { isOnMobileData: async () => false, ask })).toBe(true);
  expect(ask).not.toHaveBeenCalled();
});

it('asks on mobile data: allow plays once and keeps the warning on', async () => {
  expect(await confirmStreaming(true, off, { isOnMobileData: async () => true, ask: async () => 'allow' })).toBe(true);
  expect(off).not.toHaveBeenCalled();
});

it('always allow plays and turns the warning off', async () => {
  expect(await confirmStreaming(true, off, { isOnMobileData: async () => true, ask: async () => 'always' })).toBe(true);
  expect(off).toHaveBeenCalledTimes(1);
});

it('cancel blocks playback and changes nothing', async () => {
  expect(await confirmStreaming(true, off, { isOnMobileData: async () => true, ask: async () => 'cancel' })).toBe(false);
  expect(off).not.toHaveBeenCalled();
});
