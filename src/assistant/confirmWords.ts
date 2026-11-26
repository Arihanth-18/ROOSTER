/** Spoken yes / no / choice detection for confirmations, in English, Hindi and Kannada (native + romanised). */

const YES_WORDS = [
  'yes', 'yeah', 'yep', 'yup', 'ok', 'okay', 'sure', 'correct', 'right', 'confirm', 'go', 'please',
  'haan', 'haa', 'han', 'ha', 'ji', 'theek', 'thik', 'sahi', 'bilkul', 'karo', 'kar',
  'haudu', 'houdu', 'sari', 'maadi', 'madi',
  'हाँ', 'हां', 'हा', 'जी', 'ठीक', 'सही', 'बिल्कुल', 'करो', 'कर',
  'ಹೌದು', 'ಸರಿ', 'ಹೂಂ', 'ಹೂ', 'ಮಾಡಿ', 'ಮಾಡು',
];

const NO_WORDS = [
  'no', 'nope', 'cancel', 'stop', "don't", 'dont', 'not', 'wait', 'wrong',
  'nahi', 'nahin', 'na', 'mat', 'ruko', 'illa', 'beda', 'bedа',
  'नहीं', 'ना', 'मत', 'रद्द', 'रुको', 'रहने',
  'ಇಲ್ಲ', 'ಬೇಡ', 'ರದ್ದು', 'ರದ್ದುಮಾಡಿ', 'ನಿಲ್ಲಿಸಿ',
];

const ORDINALS: Array<[RegExp, number]> = [
  [/\b(1|one|first|pehla|pehle|ek)\b|पहला|पहले|एक|ಮೊದಲ|ಒಂದು/i, 0],
  [/\b(2|two|second|doosra|dusra)\b|दूसरा|दूसरे|दो|ಎರಡನೇ|ಎರಡು/i, 1],
  [/\b(3|three|third|teesra|teen)\b|तीसरा|तीन|ಮೂರನೇ|ಮೂರು/i, 2],
  [/\b(4|four|fourth|chautha)\b|चौथा|चार|ನಾಲ್ಕನೇ|ನಾಲ್ಕು/i, 3],
];

export type ConfirmAnswer = { kind: 'yes' } | { kind: 'no' } | { kind: 'choice'; index: number } | { kind: 'other' };

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?।"“”']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function parseConfirmAnswer(text: string, choices?: string[]): ConfirmAnswer {
  const s = text.trim().toLowerCase();
  if (!s) return { kind: 'other' };
  if (choices?.length) {
    // Check later ordinals first so "the second one" isn't read as "one".
    for (const [re, idx] of [...ORDINALS].reverse()) if (idx < choices.length && re.test(s)) return { kind: 'choice', index: idx };
    const byName = choices.findIndex(c => s.includes(c.toLowerCase().split(/[\s(]/)[0]));
    if (byName >= 0) return { kind: 'choice', index: byName };
  }
  const words = tokens(s);
  // Only short answers count — a long sentence is a new command, not a confirmation.
  if (words.length > 6) return { kind: 'other' };
  // "No" wins over "yes" ("yes, no, wait" / "haan nahi") — never act on a mixed answer.
  if (words.some(w => NO_WORDS.includes(w))) return { kind: 'no' };
  if (words.some(w => YES_WORDS.includes(w))) return { kind: 'yes' };
  return { kind: 'other' };
}
