/**
 * Apps ROOSTER can play in or search inside, with the names people say for them.
 * `canPlay`: accepts Android's play-from-search. Some apps start playing, others only show results
 *   (tested: YouTube ignores it and YouTube Music free tier only searches), so those use searchUrl instead.
 * `searchUrl`: opens that app's search results (web URLs also work in the browser if the app is missing).
 */
export type AppTarget = {
  key: string;
  label: string;
  packageName?: string;
  names: string[];
  kind: 'music' | 'video' | 'web' | 'maps' | 'shop' | 'store';
  canPlay?: boolean;
  searchUrl?: (q: string) => string;
  /** True when searchUrl works in a browser too (so a missing app is not a dead end). */
  webFallback?: boolean;
};

const enc = encodeURIComponent;

export const APP_TARGETS: AppTarget[] = [
  {
    key: 'youtube_music', label: 'YouTube Music', packageName: 'com.google.android.apps.youtube.music', kind: 'music',
    names: ['youtube music', 'yt music', 'यूट्यूब म्यूजिक', 'यूट्यूब म्यूज़िक', 'ಯೂಟ್ಯೂಬ್ ಮ್ಯೂಸಿಕ್'],
    searchUrl: q => `https://music.youtube.com/search?q=${enc(q)}`, webFallback: true,
  },
  {
    key: 'youtube', label: 'YouTube', packageName: 'com.google.android.youtube', kind: 'video',
    names: ['youtube', 'you tube', 'यूट्यूब', 'यू ट्यूब', 'ಯೂಟ್ಯೂಬ್'],
    searchUrl: q => `https://www.youtube.com/results?search_query=${enc(q)}`, webFallback: true,
  },
  {
    key: 'spotify', label: 'Spotify', packageName: 'com.spotify.music', kind: 'music',
    names: ['spotify', 'स्पॉटिफाई', 'स्पोटिफाई', 'ಸ್ಪಾಟಿಫೈ'],
    canPlay: true, searchUrl: q => `spotify:search:${enc(q)}`,
  },
  {
    key: 'jiosaavn', label: 'JioSaavn', packageName: 'com.jio.media.jiobeats', kind: 'music',
    names: ['jiosaavn', 'jio saavn', 'saavn', 'जियो सावन', 'ಜಿಯೋ ಸಾವನ್'],
    canPlay: true, searchUrl: q => `https://www.jiosaavn.com/search/${enc(q)}`, webFallback: true,
  },
  {
    key: 'gaana', label: 'Gaana', packageName: 'com.gaana', kind: 'music',
    names: ['gaana app', 'gaana'], canPlay: true,
    searchUrl: q => `https://gaana.com/search/${enc(q)}`, webFallback: true,
  },
  {
    key: 'wynk', label: 'Wynk Music', packageName: 'com.bsbportal.music', kind: 'music',
    names: ['wynk', 'wink music', 'विंक'], canPlay: true,
  },
  {
    key: 'amazon_music', label: 'Amazon Music', packageName: 'com.amazon.mp3', kind: 'music',
    names: ['amazon music'], canPlay: true,
  },
  {
    key: 'google', label: 'Google', kind: 'web',
    names: ['google', 'internet', 'web', 'chrome', 'browser', 'गूगल', 'इंटरनेट', 'ಗೂಗಲ್', 'ಇಂಟರ್ನೆಟ್'],
  },
  {
    key: 'maps', label: 'Google Maps', packageName: 'com.google.android.apps.maps', kind: 'maps',
    names: ['google maps', 'maps', 'map', 'मैप', 'मैप्स', 'ನಕ್ಷೆ', 'ಮ್ಯಾಪ್'],
    searchUrl: q => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`, webFallback: true,
  },
  {
    key: 'play_store', label: 'Play Store', packageName: 'com.android.vending', kind: 'store',
    names: ['play store', 'playstore', 'google play', 'प्ले स्टोर', 'ಪ್ಲೇ ಸ್ಟೋರ್'],
    searchUrl: q => `market://search?q=${enc(q)}`,
  },
  {
    key: 'amazon', label: 'Amazon', packageName: 'in.amazon.mShop.android.shopping', kind: 'shop',
    names: ['amazon', 'अमेज़न', 'अमेजन', 'ಅಮೆಜಾನ್'],
    searchUrl: q => `https://www.amazon.in/s?k=${enc(q)}`, webFallback: true,
  },
  {
    key: 'flipkart', label: 'Flipkart', packageName: 'com.flipkart.android', kind: 'shop',
    names: ['flipkart', 'फ्लिपकार्ट', 'ಫ್ಲಿಪ್‌ಕಾರ್ಟ್', 'ಫ್ಲಿಪ್ಕಾರ್ಟ್'],
    searchUrl: q => `https://www.flipkart.com/search?q=${enc(q)}`, webFallback: true,
  },
  {
    key: 'wikipedia', label: 'Wikipedia', kind: 'web',
    names: ['wikipedia', 'विकिपीडिया', 'ವಿಕಿಪೀಡಿಯ'],
    searchUrl: q => `https://en.wikipedia.org/w/index.php?search=${enc(q)}`, webFallback: true,
  },
];

const squash = (s: string) => s.toLowerCase().replace(/[\s‌‍.-]+/g, '');

/** The app the user named ("on YouTube", "Spotify pe"), preferring the longest match ("YouTube Music" over "YouTube"). */
export function findAppTarget(spoken: string | undefined): AppTarget | undefined {
  if (!spoken?.trim()) return undefined;
  const s = squash(spoken);
  let best: { target: AppTarget; len: number } | undefined;
  for (const target of APP_TARGETS) {
    for (const name of target.names) {
      const n = squash(name);
      if (n && s.includes(n) && (!best || n.length > best.len)) best = { target, len: n.length };
    }
  }
  return best?.target;
}

/**
 * Splits "bhajans on YouTube" / "यूट्यूब पर भजन" / "ಯೂಟ್ಯೂಬ್‌ನಲ್ಲಿ ಭಜನೆ" into the request and the app named.
 * Only apps in APP_TARGETS count, so "songs from the 90s" keeps its words.
 */
export function extractApp(text: string): { rest: string; app?: AppTarget } {
  const app = findAppTarget(text);
  if (!app) return { rest: text.trim() };
  const lower = text.toLowerCase();
  const names = [...app.names].sort((a, b) => b.length - a.length);
  for (const name of names) {
    const i = lower.indexOf(name.toLowerCase());
    if (i < 0) continue;
    const before = text.slice(0, i).replace(/\s*\b(?:on|in|using|from|at|via)\s*$/i, '');
    const after = text
      .slice(i + name.length)
      .replace(/^[‌‍]?(?:ನಲ್ಲಿ|ದಲ್ಲಿ|ಅಲ್ಲಿ)/, '')
      .replace(/^\s*(?:app\b)?\s*(?:पर|में|से)?/i, '');
    return { rest: `${before} ${after}`.replace(/\s+/g, ' ').trim(), app };
  }
  return { rest: text.trim(), app };
}

/**
 * Which app to use when none was named: YouTube (opened on its search results). Only phones
 * without YouTube fall back to an installed music app (Spotify, YouTube Music, JioSaavn...).
 */
export function pickPlayer(installed: Set<string>): AppTarget | undefined {
  const youtube = APP_TARGETS.find(a => a.key === 'youtube')!;
  if (installed.has(youtube.packageName!)) return youtube;
  return APP_TARGETS.find(a => a.kind === 'music' && a.packageName && installed.has(a.packageName));
}
