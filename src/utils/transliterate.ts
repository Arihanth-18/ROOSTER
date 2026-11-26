/**
 * Rough Devanagari / Kannada → Latin transliteration, used only to match spoken
 * names ("रमेश", "ರಮೇಶ") against contacts saved in English letters ("Ramesh").
 * It is intentionally approximate; matching is fuzzy on top of it.
 */

const CONSONANTS: Record<string, string> = {
  // Devanagari
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l', 'क़': 'q', 'ज़': 'z', 'फ़': 'f',
  // Kannada
  'ಕ': 'k', 'ಖ': 'kh', 'ಗ': 'g', 'ಘ': 'gh', 'ಙ': 'n',
  'ಚ': 'ch', 'ಛ': 'chh', 'ಜ': 'j', 'ಝ': 'jh', 'ಞ': 'n',
  'ಟ': 't', 'ಠ': 'th', 'ಡ': 'd', 'ಢ': 'dh', 'ಣ': 'n',
  'ತ': 't', 'ಥ': 'th', 'ದ': 'd', 'ಧ': 'dh', 'ನ': 'n',
  'ಪ': 'p', 'ಫ': 'ph', 'ಬ': 'b', 'ಭ': 'bh', 'ಮ': 'm',
  'ಯ': 'y', 'ರ': 'r', 'ಲ': 'l', 'ವ': 'v', 'ಶ': 'sh',
  'ಷ': 'sh', 'ಸ': 's', 'ಹ': 'h', 'ಳ': 'l',
};

const VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऋ': 'ri',
  'ಅ': 'a', 'ಆ': 'aa', 'ಇ': 'i', 'ಈ': 'ee', 'ಉ': 'u', 'ಊ': 'oo',
  'ಎ': 'e', 'ಏ': 'e', 'ಐ': 'ai', 'ಒ': 'o', 'ಓ': 'o', 'ಔ': 'au', 'ಋ': 'ri',
};

const VOWEL_SIGNS: Record<string, string> = {
  'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ृ': 'ri',
  'ಾ': 'a', 'ಿ': 'i', 'ೀ': 'ee', 'ು': 'u', 'ೂ': 'oo', 'ೆ': 'e', 'ೇ': 'e', 'ೈ': 'ai', 'ೊ': 'o', 'ೋ': 'o', 'ೌ': 'au', 'ೃ': 'ri',
};

const VIRAMA = new Set(['्', '್']);
const NASAL = new Set(['ं', 'ँ', 'ಂ']);
const NUKTA = '़';

export function hasIndicScript(text: string): boolean {
  return /[ऀ-ॿಀ-೿]/.test(text);
}

export function transliterateToLatin(text: string): string {
  let out = '';
  const chars = Array.from(text.normalize('NFC'));
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === NUKTA) continue;
    const cons = CONSONANTS[ch];
    if (cons !== undefined) {
      const next = chars[i + 1] === NUKTA ? chars[i + 2] : chars[i + 1];
      if (next !== undefined && (VIRAMA.has(next) || VOWEL_SIGNS[next] !== undefined)) {
        out += cons;
      } else {
        // Inherent 'a'. Hindi drops a word-final schwa ("Ramesh", not "Ramesha"); Kannada keeps it less consistently,
        // so we drop it at word end for both — fuzzy matching tolerates the difference.
        const atWordEnd = next === undefined || /\s/.test(next) || NASAL.has(next) === false && CONSONANTS[next] === undefined && VOWELS[next] === undefined;
        out += atWordEnd ? cons : cons + 'a';
      }
      continue;
    }
    if (VOWEL_SIGNS[ch] !== undefined) { out += VOWEL_SIGNS[ch]; continue; }
    if (VOWELS[ch] !== undefined) { out += VOWELS[ch]; continue; }
    if (VIRAMA.has(ch)) continue;
    if (NASAL.has(ch)) { out += 'n'; continue; }
    if (ch === 'ः' || ch === 'ಃ') { out += 'h'; continue; }
    out += ch;
  }
  return out;
}
