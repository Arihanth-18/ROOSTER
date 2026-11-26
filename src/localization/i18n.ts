import { en, hi, kn, type StringKey } from './strings';
import type { Language } from '../types';

const TABLES: Record<Language, Record<StringKey, string>> = { en, hi, kn };

export type TFunction = (key: StringKey, vars?: Record<string, string | number>) => string;

export function translate(lang: Language, key: StringKey, vars?: Record<string, string | number>): string {
  const template = TABLES[lang]?.[key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export const makeT = (lang: Language): TFunction => (key, vars) => translate(lang, key, vars);

export const LANGUAGE_OPTIONS: Array<{ code: Language; native: string; english: string }> = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada' },
];

export type { StringKey };
