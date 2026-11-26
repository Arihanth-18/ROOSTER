import { hasIndicScript, transliterateToLatin } from './transliterate';

export type MatchableContact = {
  id: string;
  name: string;
  phone: string;
  /** Optional relationship for trusted contacts, e.g. "son", "daughter", "doctor". */
  relationship?: string;
};

export type ContactMatchResult =
  | { kind: 'none' }
  | { kind: 'single'; contact: MatchableContact }
  | { kind: 'ambiguous'; candidates: MatchableContact[] };

/** Spoken relationship words (en / hi / kn, native and romanised) → canonical relationship. */
const RELATIONSHIP_WORDS: Record<string, string> = {
  son: 'son', beta: 'son', bete: 'son', 'बेटा': 'son', 'बेटे': 'son', maga: 'son', 'ಮಗ': 'son', 'ಮಗನಿಗೆ': 'son',
  daughter: 'daughter', beti: 'daughter', 'बेटी': 'daughter', magalu: 'daughter', 'ಮಗಳು': 'daughter', 'ಮಗಳಿಗೆ': 'daughter',
  wife: 'wife', patni: 'wife', 'पत्नी': 'wife', hendati: 'wife', 'ಹೆಂಡತಿ': 'wife',
  husband: 'husband', pati: 'husband', 'पति': 'husband', ganda: 'husband', 'ಗಂಡ': 'husband',
  mother: 'mother', mom: 'mother', amma: 'mother', maa: 'mother', 'माँ': 'mother', 'मां': 'mother', 'ಅಮ್ಮ': 'mother',
  father: 'father', dad: 'father', appa: 'father', papa: 'father', 'पापा': 'father', 'ಅಪ್ಪ': 'father',
  brother: 'brother', bhai: 'brother', 'भाई': 'brother', anna: 'brother', 'ಅಣ್ಣ': 'brother',
  sister: 'sister', behen: 'sister', 'बहन': 'sister', akka: 'sister', 'ಅಕ್ಕ': 'sister',
  doctor: 'doctor', 'डॉक्टर': 'doctor', 'ವೈದ್ಯ': 'doctor', 'ಡಾಕ್ಟರ್': 'doctor',
  neighbour: 'neighbour', neighbor: 'neighbour', padosi: 'neighbour', 'पड़ोसी': 'neighbour',
};

const FILLER = new Set([
  'my', 'the', 'to', 'mr', 'mrs', 'ms', 'dr', 'sir', 'madam', 'ji', 'jee', 'garu', 'avaru', 'avarige',
  'mera', 'meri', 'mere', 'ko', 'se', 'nanna', 'ge', 'please',
  'मेरा', 'मेरी', 'मेरे', 'को', 'जी', 'ನನ್ನ', 'ಅವರಿಗೆ',
]);

export function normalizeName(text: string): string {
  const latin = hasIndicScript(text) ? transliterateToLatin(text) : text;
  return latin
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Collapse common romanisation variants so "Ramesh"/"Ramesha"/"Rammesh" compare closely. */
function phonetic(token: string): string {
  return token
    .replace(/(.)\1+/g, '$1')
    .replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u')
    .replace(/w/g, 'v').replace(/z/g, 'j').replace(/ph/g, 'f')
    .replace(/([bcdgjkpt])h/g, '$1')
    .replace(/a$/, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function tokenScore(spoken: string, saved: string): number {
  if (spoken === saved) return 1;
  const ps = phonetic(spoken);
  const pv = phonetic(saved);
  if (ps === pv) return 0.95;
  if (pv.startsWith(ps) && ps.length >= 3) return 0.85;
  const maxLen = Math.max(ps.length, pv.length);
  if (maxLen < 4) return 0;
  const dist = levenshtein(ps, pv);
  const allowed = maxLen >= 7 ? 2 : 1;
  return dist <= allowed ? 0.8 - dist * 0.1 : 0;
}

function scoreContact(spokenTokens: string[], contact: MatchableContact): number {
  const savedTokens = normalizeName(contact.name).split(' ').filter(Boolean);
  if (savedTokens.length === 0 || spokenTokens.length === 0) return 0;
  let total = 0;
  for (const s of spokenTokens) {
    total += Math.max(0, ...savedTokens.map(v => tokenScore(s, v)));
  }
  return total / spokenTokens.length;
}

/** Generic fuzzy lookup by name (used for app names). Returns the best near-tied matches. */
export function fuzzyFind<T extends { name: string }>(spoken: string, items: T[], minScore = 0.7): T[] {
  const tokens = normalizeName(spoken).split(' ').filter(t => t && !FILLER.has(t) && t !== 'app');
  if (tokens.length === 0) return [];
  const scored = items
    .map(item => {
      const saved = normalizeName(item.name).split(' ').filter(Boolean);
      const joined = saved.join('');
      // Also compare the whole spoken phrase to the joined label ("what s app" vs "whatsapp").
      const whole = tokenScore(tokens.join(''), joined);
      const perToken = tokens.reduce((sum, s) => sum + Math.max(0, ...saved.map(v => tokenScore(s, v))), 0) / tokens.length;
      return { item, s: Math.max(whole, perToken) };
    })
    .filter(x => x.s >= minScore)
    .sort((a, b) => b.s - a.s);
  if (scored.length === 0) return [];
  return scored.filter(x => scored[0].s - x.s < 0.1).map(x => x.item);
}

export function relationshipFrom(spoken: string): string | undefined {
  const raw = spoken.toLowerCase().split(/\s+/);
  for (const w of raw) {
    const rel = RELATIONSHIP_WORDS[w];
    if (rel) return rel;
  }
  return undefined;
}

/**
 * Find the contact the user means. Trusted contacts with a matching relationship win
 * ("call my son"). Otherwise fuzzy name matching; near-ties are reported as ambiguous
 * so the app asks instead of guessing.
 */
export function matchContact(
  spokenName: string,
  contacts: MatchableContact[],
  trusted: MatchableContact[] = [],
): ContactMatchResult {
  const rel = relationshipFrom(spokenName);
  if (rel) {
    const byRel = trusted.filter(c => c.relationship?.toLowerCase() === rel);
    if (byRel.length === 1) return { kind: 'single', contact: byRel[0] };
    if (byRel.length > 1) return { kind: 'ambiguous', candidates: byRel };
  }

  const tokens = normalizeName(spokenName)
    .split(' ')
    .filter(t => t && !FILLER.has(t));
  if (tokens.length === 0) return { kind: 'none' };

  // Trusted contacts first, then the rest; de-duplicate by phone number.
  const seen = new Set<string>();
  const pool: MatchableContact[] = [];
  for (const c of [...trusted, ...contacts]) {
    const key = c.phone.replace(/\D/g, '').slice(-10);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(c);
  }

  const scored = pool
    .map(c => ({ c, s: scoreContact(tokens, c) }))
    .filter(x => x.s >= 0.7)
    .sort((a, b) => b.s - a.s);

  if (scored.length === 0) return { kind: 'none' };
  const best = scored[0].s;
  const close = scored.filter(x => best - x.s < 0.1).map(x => x.c);
  if (close.length === 1) return { kind: 'single', contact: close[0] };
  return { kind: 'ambiguous', candidates: close.slice(0, 4) };
}
