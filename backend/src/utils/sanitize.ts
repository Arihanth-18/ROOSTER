/**
 * Clean model text so it is safe to display and pleasant to speak:
 * strips control characters, markdown symbols, URLs-as-markup and collapses whitespace.
 */
export function sanitizeSpokenText(input: string, maxLength = 1000): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[*_#`~>|]+/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
