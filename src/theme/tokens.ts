import type { AccessibilityPrefs } from '../accessibility/types';

export type Palette = {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  border: string;
  danger: string;
  onDanger: string;
  success: string;
  warning: string;
  warningBg: string;
  focus: string;
  borderWidth: number;
  /** Header band and page accents (light sky blue). */
  hero: string;
  /** Highlight colour: the Talk button, active items, icon circles (mint green). */
  accent: string;
  onAccent: string;
  /** Soft tints for activity icons: medicine, appointment, task. */
  tintMedicine: string;
  tintAppointment: string;
  tintTask: string;
  /** Soft shadow under cards (off in the high-contrast modes, which use borders instead). */
  shadow: boolean;
};

/**
 * Light sky blue, white cards, black text and buttons, mint-green accent — calm and easy to read.
 * Text is near-black on white or light blue (≥ 12:1). Standard meets WCAG AA everywhere; "high" and
 * "aaa" drop the soft shadows for solid borders and push every text colour to ≥ 7:1.
 */
const PALETTES: Record<AccessibilityPrefs['contrast'], Palette> = {
  standard: {
    background: '#EAF5FC',
    surface: '#FFFFFF',
    surfaceAlt: '#D7EEFA',
    text: '#0B0F14',
    textMuted: '#3B4754',
    primary: '#0B0F14',
    primaryPressed: '#2B3440',
    onPrimary: '#FFFFFF',
    border: '#C5DCEB',
    danger: '#B42318',
    onDanger: '#FFFFFF',
    success: '#0E6E47',
    warning: '#7A4B00',
    warningBg: '#FFF4D6',
    focus: '#0B0F14',
    borderWidth: 1,
    hero: '#BFE4F8',
    accent: '#7EE0B5',
    onAccent: '#0B0F14',
    tintMedicine: '#C9F2DF',
    tintAppointment: '#CDE8FA',
    tintTask: '#E6E3FA',
    shadow: true,
  },
  high: {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceAlt: '#EEF3FF',
    text: '#000000',
    textMuted: '#1F2937',
    primary: '#0033A0',
    primaryPressed: '#001F66',
    onPrimary: '#FFFFFF',
    border: '#000000',
    danger: '#9B1C1C',
    onDanger: '#FFFFFF',
    success: '#05603A',
    warning: '#5C3800',
    warningBg: '#FFF4D6',
    focus: '#000000',
    borderWidth: 2,
    hero: '#CFEAFB',
    accent: '#7EE0B5',
    onAccent: '#000000',
    tintMedicine: '#C9F2DF',
    tintAppointment: '#CDE8FA',
    tintTask: '#E6E3FA',
    shadow: false,
  },
  aaa: {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceAlt: '#FFFFFF',
    text: '#000000',
    textMuted: '#000000',
    primary: '#00205B',
    primaryPressed: '#000000',
    onPrimary: '#FFFFFF',
    border: '#000000',
    danger: '#7A0000',
    onDanger: '#FFFFFF',
    success: '#003D1F',
    warning: '#000000',
    warningBg: '#FFE89A',
    focus: '#000000',
    borderWidth: 3,
    hero: '#FFFFFF',
    accent: '#A7F3D0',
    onAccent: '#000000',
    tintMedicine: '#FFFFFF',
    tintAppointment: '#FFFFFF',
    tintTask: '#FFFFFF',
    shadow: false,
  },
};

const TEXT_SCALE: Record<AccessibilityPrefs['textSize'], number> = {
  standard: 1,
  large: 1.22,
  xlarge: 1.45,
};

export type Theme = {
  colors: Palette;
  font: { body: number; small: number; title: number; heading: number; button: number; huge: number };
  touch: number;
  space: (n: number) => number;
  radius: number;
  bold: '700' | '800';
};

export function buildTheme(prefs: AccessibilityPrefs): Theme {
  const s = TEXT_SCALE[prefs.textSize];
  const aaa = prefs.contrast !== 'standard';
  return {
    colors: PALETTES[prefs.contrast],
    font: {
      small: Math.round(16 * s),
      body: Math.round(19 * s),
      button: Math.round(20 * s),
      heading: Math.round(23 * s),
      title: Math.round(30 * s),
      huge: Math.round(40 * s),
    },
    touch: prefs.largeTouchTargets ? 72 : 56,
    space: (n: number) => n * (prefs.largeTouchTargets ? 9 : 8),
    radius: 24,
    bold: aaa ? '800' : '700',
  };
}
