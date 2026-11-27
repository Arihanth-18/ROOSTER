/**
 * WhatsApp needs the full international number without "+" or spaces.
 * Local Indian numbers ("98765 43210", "098765 43210") get the 91 country code.
 */
export function toWhatsAppNumber(phone: string): string | null {
  const raw = phone.trim();
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (!raw.startsWith('+')) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = '91' + digits.slice(1);
    else if (digits.length === 10) digits = '91' + digits;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}
