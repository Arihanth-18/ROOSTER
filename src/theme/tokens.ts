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
};

/** Blue & white. Standard meets WCAG AA (≥4.5:1 text); "aaa" targets ≥7:1 for all text. */
const PALETTES: Record<AccessibilityPrefs['contrast'], Palette> = {
  standard: {
    background: '#FFFFFF',
    surface: '#F1F5FD',
    surfaceAlt: '#E3ECFB',
    text: '#0B1B33',
    textMuted: '#3D4F6B',
    primary: '#1D4ED8',
    primaryPressed: '#1E3A8A',
    onPrimary: '#FFFFFF',
    border: '#B9C8E4',
    danger: '#B42318',
    onDanger: '#FFFFFF',
    success: '#067647',
    warning: '#7A4B00',
    warningBg: '#FFF4D6',
    focus: '#F59E0B',
    borderWidth: 1,
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
    radius: 18,
    bold: aaa ? '800' : '700',
  };
}
