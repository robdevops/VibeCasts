import { createMemoryKV } from './storage';
import { createWriter, flushAllWrites } from './writer';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const settle = () => Promise.resolve();

it('writes once for a burst, with the latest value', async () => {
  const storage = createMemoryKV();
  const spy = jest.spyOn(storage, 'setItem');
  const w = createWriter(storage, 'k', Date.now);
  w.schedule(() => 'a', 200);
  w.schedule(() => 'b', 200);
  w.schedule(() => 'c', 200);
  jest.advanceTimersByTime(250);
  await settle();
  expect(spy).toHaveBeenCalledTimes(1);
  expect(await storage.getItem('k')).toBe('c');
});

it('a slow change never delays an earlier pending write', async () => {
  const storage = createMemoryKV();
  const w = createWriter(storage, 'k', Date.now);
  w.schedule(() => 'structural', 100);
  w.schedule(() => 'progress', 3000); // must not push the 100 ms deadline back
  jest.advanceTimersByTime(150);
  await settle();
  expect(await storage.getItem('k')).toBe('progress'); // latest state, at the earlier time
});

it('a fast change pulls a slow pending write forward', async () => {
  const storage = createMemoryKV();
  const w = createWriter(storage, 'k', Date.now);
  w.schedule(() => 'slow', 3000);
  w.schedule(() => 'fast', 100);
  jest.advanceTimersByTime(150);
  await settle();
  expect(await storage.getItem('k')).toBe('fast');
});

it('flush writes immediately, and flushAllWrites reaches every writer', async () => {
  const storage = createMemoryKV();
  const a = createWriter(storage, 'a', Date.now);
  const b = createWriter(storage, 'b', Date.now);
  a.schedule(() => '1', 5000);
  b.schedule(() => '2', 5000);
  flushAllWrites();
  await settle();
  expect(await storage.getItem('a')).toBe('1');
  expect(await storage.getItem('b')).toBe('2');
  jest.advanceTimersByTime(6000); // nothing left to write
});
