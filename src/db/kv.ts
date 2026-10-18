import { openDatabaseSync } from 'expo-sqlite';

import type { KV } from './storage';

let db: ReturnType<typeof openDatabaseSync> | undefined;

function open() {
  if (!db) {
    db = openDatabaseSync('podcasts.db');
    db.execSync('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)');
  }
  return db;
}

export const kv: KV = {
  getItem: async (key) =>
    open().getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key)?.value ?? null,
  setItem: async (key, value) => {
    open().runSync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, value);
  },
  removeItem: async (key) => {
    open().runSync('DELETE FROM kv WHERE key = ?', key);
  },
};
