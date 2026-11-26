import { getDb, newId } from './db';
import type { ChatTurn, Fact, Note, Reminder, TrustedContact } from '../types';
import { DEFAULT_SETTINGS, type AppSettings } from '../accessibility/types';

type Row = Record<string, unknown>;

// ------------------------------------------------------------------ settings

export const settingsRepo = {
  async load(): Promise<AppSettings> {
    const res = await getDb().execute('SELECT value FROM kv WHERE key = ?', ['settings']);
    const raw = res.rows[0]?.value;
    if (typeof raw !== 'string') return DEFAULT_SETTINGS;
    try {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        prefs: { ...DEFAULT_SETTINGS.prefs, ...(parsed.prefs ?? {}) },
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },
  async save(s: AppSettings): Promise<void> {
    await getDb().execute('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', ['settings', JSON.stringify(s)]);
  },
};

// ------------------------------------------------------------------ reminders

const toReminder = (r: Row): Reminder => ({
  id: String(r.id),
  title: String(r.title),
  type: r.type as Reminder['type'],
  localDateTime: String(r.local_dt),
  recurrence: r.recurrence as Reminder['recurrence'],
  completed: Number(r.completed) === 1,
  createdAt: Number(r.created_at),
});

export const remindersRepo = {
  async all(): Promise<Reminder[]> {
    const res = await getDb().execute('SELECT * FROM reminders ORDER BY local_dt ASC');
    return res.rows.map(toReminder);
  },
  async get(id: string): Promise<Reminder | null> {
    const res = await getDb().execute('SELECT * FROM reminders WHERE id = ?', [id]);
    return res.rows[0] ? toReminder(res.rows[0]) : null;
  },
  async upsert(r: Omit<Reminder, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): Promise<Reminder> {
    const full: Reminder = { ...r, id: r.id ?? newId(), createdAt: r.createdAt ?? Date.now() };
    await getDb().execute(
      `INSERT OR REPLACE INTO reminders (id, title, type, local_dt, recurrence, completed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [full.id, full.title, full.type, full.localDateTime, full.recurrence, full.completed ? 1 : 0, full.createdAt],
    );
    return full;
  },
  async remove(id: string): Promise<void> {
    await getDb().execute('DELETE FROM reminders WHERE id = ?', [id]);
  },
};

// ------------------------------------------------------------------ notes & facts

const textRepo = (table: 'notes' | 'facts') => ({
  async all(): Promise<Note[]> {
    const res = await getDb().execute(`SELECT * FROM ${table} ORDER BY created_at DESC`);
    return res.rows.map(r => ({ id: String(r.id), text: String(r.text), createdAt: Number(r.created_at) }));
  },
  async add(text: string): Promise<Note> {
    const n = { id: newId(), text: text.trim(), createdAt: Date.now() };
    await getDb().execute(`INSERT INTO ${table} (id, text, created_at) VALUES (?, ?, ?)`, [n.id, n.text, n.createdAt]);
    return n;
  },
  async update(id: string, text: string): Promise<void> {
    await getDb().execute(`UPDATE ${table} SET text = ? WHERE id = ?`, [text.trim(), id]);
  },
  async remove(id: string): Promise<void> {
    await getDb().execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
  },
  async search(query: string): Promise<Note[]> {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    const items = await this.all();
    if (words.length === 0) return items;
    return items.filter(n => words.some(w => n.text.toLowerCase().includes(w)));
  },
});

export const notesRepo = textRepo('notes');
export const factsRepo: ReturnType<typeof textRepo> & { all(): Promise<Fact[]> } = textRepo('facts');

// ------------------------------------------------------------------ trusted contacts

export const trustedRepo = {
  async all(): Promise<TrustedContact[]> {
    const res = await getDb().execute('SELECT * FROM trusted_contacts ORDER BY name ASC');
    return res.rows.map(r => ({
      id: String(r.id),
      name: String(r.name),
      phone: String(r.phone),
      relationship: r.relationship ? String(r.relationship) : undefined,
      isEmergency: Number(r.is_emergency) === 1,
    }));
  },
  async upsert(c: Omit<TrustedContact, 'id'> & { id?: string }): Promise<void> {
    await getDb().execute(
      'INSERT OR REPLACE INTO trusted_contacts (id, name, phone, relationship, is_emergency) VALUES (?, ?, ?, ?, ?)',
      [c.id ?? newId(), c.name.trim(), c.phone.trim(), c.relationship?.trim().toLowerCase() || null, c.isEmergency ? 1 : 0],
    );
  },
  async remove(id: string): Promise<void> {
    await getDb().execute('DELETE FROM trusted_contacts WHERE id = ?', [id]);
  },
};

// ------------------------------------------------------------------ conversation

const MAX_TURNS = 60;

export const conversationRepo = {
  async recent(): Promise<ChatTurn[]> {
    const res = await getDb().execute('SELECT * FROM conversation ORDER BY id DESC LIMIT ?', [MAX_TURNS]);
    return res.rows
      .map(r => ({
        role: r.role as ChatTurn['role'],
        text: String(r.text),
        at: Number(r.at),
        offline: Number(r.offline) === 1,
      }))
      .reverse();
  },
  async add(turn: ChatTurn): Promise<void> {
    const conn = getDb();
    await conn.execute('INSERT INTO conversation (role, text, at, offline) VALUES (?, ?, ?, ?)', [
      turn.role, turn.text, turn.at, turn.offline ? 1 : 0,
    ]);
    await conn.execute(
      'DELETE FROM conversation WHERE id NOT IN (SELECT id FROM conversation ORDER BY id DESC LIMIT ?)',
      [MAX_TURNS],
    );
  },
};
