import { createMemoryKV } from '@/db/storage';

import { createSettingsStore } from './settings';

jest.mock('@/db/kv', () => ({ kv: {} }));

it('turns the old "delete episode when finished" into auto delete after playing', async () => {
  const storage = createMemoryKV();
  await storage.setItem('settings.v1', JSON.stringify({ deleteOnFinish: true, skipBackSec: 20 }));
  const s = createSettingsStore(storage);
  await s.getState().hydrate();
  expect(s.getState().autoDelete).toBe('played');
  expect(s.getState().skipBackSec).toBe(20);
  expect((s.getState() as unknown as Record<string, unknown>).deleteOnFinish).toBeUndefined();
});

it('keeps an explicit auto delete choice and defaults to never', async () => {
  const storage = createMemoryKV();
  await storage.setItem('settings.v1', JSON.stringify({ deleteOnFinish: true, autoDelete: '2d' }));
  const s = createSettingsStore(storage);
  await s.getState().hydrate();
  expect(s.getState().autoDelete).toBe('2d');
  expect(createSettingsStore(createMemoryKV()).getState().autoDelete).toBe('never');
});
