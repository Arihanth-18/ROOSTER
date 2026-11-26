import { open, type DB } from '@op-engineering/op-sqlite';
import * as Keychain from 'react-native-keychain';

const DB_NAME = 'rooster.sqlite';
const KEY_SERVICE = 'rooster.db.key';

let db: DB | null = null;

/**
 * 256-bit key from SQLite's CSPRNG (Hermes has no Web Crypto). Generated in a throwaway
 * in-memory database, then stored in Android Keystore-backed secure storage.
 */
async function getOrCreateKey(): Promise<string> {
  const existing = await Keychain.getGenericPassword({ service: KEY_SERVICE });
  if (existing && existing.password) return existing.password;
  const tmp = open({ name: 'rooster-keygen.sqlite', location: ':memory:' });
  const res = await tmp.execute('SELECT hex(randomblob(32)) AS k');
  tmp.close();
  const key = String(res.rows[0]?.k ?? '');
  if (key.length !== 64) throw new Error('Could not generate database key');
  await Keychain.setGenericPassword('rooster', key, {
    service: KEY_SERVICE,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
  });
  return key;
}

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reminders (
     id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL,
     local_dt TEXT NOT NULL, recurrence TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS facts (id TEXT PRIMARY KEY NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS trusted_contacts (
     id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL,
     relationship TEXT, is_emergency INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS conversation (
     id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, text TEXT NOT NULL,
     at INTEGER NOT NULL, offline INTEGER NOT NULL DEFAULT 0)`,
];

export async function initDb(): Promise<DB> {
  if (db) return db;
  const key = await getOrCreateKey();
  const conn = open({ name: DB_NAME, encryptionKey: key });
  for (const sql of MIGRATIONS) await conn.execute(sql);
  db = conn;
  return conn;
}

export function getDb(): DB {
  if (!db) throw new Error('Database not initialised');
  return db;
}

export function newId(): string {
  return Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
}

/** Wipes every table (used by "Delete all my data"). Keeps the encryption key. */
export async function wipeAllData(): Promise<void> {
  const conn = getDb();
  for (const table of ['reminders', 'notes', 'facts', 'trusted_contacts', 'conversation']) {
    await conn.execute(`DELETE FROM ${table}`);
  }
}
