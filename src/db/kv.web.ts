import type { KV } from './storage';

const ls = () => (typeof localStorage === 'undefined' ? undefined : localStorage);

export const kv: KV = {
  getItem: async (key) => ls()?.getItem(key) ?? null,
  setItem: async (key, value) => void ls()?.setItem(key, value),
  removeItem: async (key) => void ls()?.removeItem(key),
};
