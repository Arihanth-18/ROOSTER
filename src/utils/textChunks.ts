/**
 * Split long text into speakable chunks at sentence boundaries (including the Devanagari danda "।"),
 * so long documents can be paused/resumed chunk by chunk and stay under TTS input limits.
 */
export function splitForSpeech(text: string, maxLen = 350): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?।\n]+[.!?।]*/g) ?? [clean];
  const chunks: string[] = [];
  let current = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > maxLen) {
      if (current) { chunks.push(current); current = ''; }
      // Hard-wrap very long sentences at word boundaries.
      let rest = s;
      while (rest.length > maxLen) {
        const cut = rest.lastIndexOf(' ', maxLen);
        const at = cut > maxLen / 2 ? cut : maxLen;
        chunks.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      current = rest;
      continue;
    }
    if ((current + ' ' + s).trim().length > maxLen) {
      chunks.push(current);
      current = s;
    } else {
      current = (current + ' ' + s).trim();
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
