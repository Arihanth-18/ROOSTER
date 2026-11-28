import { matchContact, normalizeName, type MatchableContact } from '../src/utils/contactMatch';
import { transliterateToLatin } from '../src/utils/transliterate';
import { nextOccurrence, occursOn, toLocalDateTime, parseLocalDateTime } from '../src/utils/dates';
import { splitForSpeech } from '../src/utils/textChunks';
import { numberWordsToDigits, parseOffline } from '../src/services/offlineParser';
import { toWhatsAppNumber } from '../src/utils/phone';
import { findAppTarget, pickPlayer } from '../src/utils/mediaApps';

const contacts: MatchableContact[] = [
  { id: '1', name: 'Ramesh Kumar', phone: '+91 98450 11111' },
  { id: '2', name: 'Suresh', phone: '+91 98450 22222' },
  { id: '3', name: 'Ravi Son', phone: '+91 98450 33333' },
  { id: '4', name: 'Dr. Lakshmi', phone: '080 2222 4444' },
  { id: '5', name: 'Ravi Shankar', phone: '+91 98450 55555' },
];

describe('transliteration', () => {
  it('converts Hindi and Kannada names to rough Latin', () => {
    expect(transliterateToLatin('रमेश')).toBe('ramesh');
    expect(normalizeName('ರಮೇಶ್')).toBe('ramesh');
  });
});

describe('matchContact', () => {
  it('matches an English name', () => {
    const r = matchContact('Ramesh', contacts);
    expect(r.kind === 'single' && r.contact.id).toBe('1');
  });

  it('matches a name spoken in Devanagari', () => {
    const r = matchContact('रमेश', contacts);
    expect(r.kind === 'single' && r.contact.id).toBe('1');
  });

  it('tolerates small recognition errors', () => {
    const r = matchContact('Suresh ji', contacts);
    expect(r.kind === 'single' && r.contact.id).toBe('2');
  });

  it('reports ambiguity instead of guessing', () => {
    const r = matchContact('Ravi', contacts);
    expect(r.kind).toBe('ambiguous');
  });

  it('resolves relationships via trusted contacts', () => {
    const trusted = [{ id: 't1', name: 'Ravi Shankar', phone: '+91 98450 55555', relationship: 'son' }];
    const r = matchContact('my son', contacts, trusted);
    expect(r.kind === 'single' && r.contact.id).toBe('t1');
    const r2 = matchContact('बेटा', contacts, trusted);
    expect(r2.kind === 'single' && r2.contact.id).toBe('t1');
  });

  it('returns none for unknown people', () => {
    expect(matchContact('Zubin', contacts).kind).toBe('none');
  });
});

describe('dates', () => {
  const now = new Date(2026, 10, 26, 10, 0); // 26 Nov 2026 10:00 local

  it('one-time reminders in the past have no next occurrence', () => {
    expect(nextOccurrence('2026-11-26T09:00', 'none', now)).toBeNull();
    expect(nextOccurrence('2026-11-26T11:00', 'none', now)?.getHours()).toBe(11);
  });

  it('daily reminders roll forward to the next day', () => {
    const next = nextOccurrence('2026-11-20T08:00', 'daily', now)!;
    expect(toLocalDateTime(next)).toBe('2026-11-27T08:00');
  });

  it('weekly reminders keep their weekday', () => {
    // Thursday 08:00; at 10:00 on Thursday 26th today's slot has passed, so next is 3 Dec.
    expect(toLocalDateTime(nextOccurrence('2026-11-19T08:00', 'weekly', now)!)).toBe('2026-12-03T08:00');
    expect(toLocalDateTime(nextOccurrence('2026-11-19T18:00', 'weekly', now)!)).toBe('2026-11-26T18:00');
  });

  it('occursOn handles recurrence', () => {
    expect(occursOn('2026-11-01T08:00', 'daily', now)).toBe(true);
    expect(occursOn('2026-11-27T08:00', 'daily', now)).toBe(false);
    expect(occursOn('2026-11-26T18:00', 'none', now)).toBe(true);
  });

  it('parses local date-times and ignores offsets', () => {
    expect(parseLocalDateTime('2026-11-27T08:30:00+05:30')?.getMinutes()).toBe(30);
    expect(parseLocalDateTime('garbage')).toBeNull();
  });
});

describe('splitForSpeech', () => {
  it('splits on sentences, including the danda', () => {
    const chunks = splitForSpeech('पहला वाक्य। दूसरा वाक्य। Third sentence.', 15);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });
  it('never returns chunks over the limit', () => {
    const chunks = splitForSpeech('word '.repeat(300), 100);
    expect(chunks.every(c => c.length <= 100)).toBe(true);
  });
});

describe('offline parser', () => {
  const now = new Date(2026, 10, 26, 10, 0);

  it('understands calls in three languages', () => {
    expect(parseOffline('Call Ramesh')?.parameters.contact_name).toBe('Ramesh');
    expect(parseOffline('रमेश को फोन करो')?.parameters.contact_name).toBe('रमेश');
    expect(parseOffline('ರಮೇಶ್ ಗೆ ಕರೆ ಮಾಡಿ')?.intent).toBe('call_contact');
  });

  it('creates a reminder with time and recurrence', () => {
    const r = parseOffline('Remind me to take BP tablet at 8 pm every day', now)!;
    expect(r.intent).toBe('create_reminder');
    expect(r.parameters.datetime).toBe('2026-11-26T20:00');
    expect(r.parameters.recurrence).toBe('daily');
    expect(r.parameters.reminder_type).toBe('medicine');
    expect(r.parameters.title?.toLowerCase()).toContain('bp tablet');
  });

  it('asks for a time if none is given', () => {
    expect(parseOffline('remind me to call the doctor', now)?.missing_information).toContain('time');
  });

  it('rolls a past time to tomorrow', () => {
    expect(parseOffline('remind me at 9 am to walk', now)?.parameters.datetime).toBe('2026-11-27T09:00');
  });

  it('always confirms SOS and calls', () => {
    expect(parseOffline('बचाओ')?.intent).toBe('emergency_help');
    expect(parseOffline('help')?.requires_confirmation).toBe(true);
    expect(parseOffline('call Suresh')?.requires_confirmation).toBe(true);
  });

  it('handles stop and repeat', () => {
    expect(parseOffline('stop')?.intent).toBe('stop_speaking');
    expect(parseOffline('फिर से बोलो')?.intent).toBe('repeat_last_response');
  });

  it('returns null for open-ended questions', () => {
    expect(parseOffline('what is the capital of France')).toBeNull();
  });

  it('recognises WhatsApp messages', () => {
    const cases: Array<[string, string, string | undefined]> = [
      ['WhatsApp Ravi saying I will be late', 'Ravi', 'I will be late'],
      ['send a WhatsApp message to Ramesh saying call me', 'Ramesh', 'call me'],
      ['send a whatsapp to Suresh', 'Suresh', undefined],
      ['message Ravi on WhatsApp saying hello', 'Ravi', 'hello'],
      ['रवि को व्हाट्सएप पर मैसेज भेजो', 'रवि', undefined],
      ['ರವಿ ಗೆ ವಾಟ್ಸಾಪ್ ಮೆಸೇಜ್ ಕಳುಹಿಸು', 'ರವಿ', undefined],
    ];
    for (const [input, name, message] of cases) {
      const r = parseOffline(input);
      expect([input, r?.intent, r?.parameters.channel, r?.parameters.contact_name, r?.parameters.message])
        .toEqual([input, 'prepare_sms', 'whatsapp', name, message]);
    }
    expect(parseOffline('message Ravi saying hi')?.parameters.channel).toBeUndefined();
    expect(parseOffline('open WhatsApp')?.intent).toBe('open_application');
  });
});

describe('clock and notes commands', () => {
  const now = new Date(2026, 10, 27, 10, 0);

  it('sets alarms in the clock, separately from reminders', () => {
    const a = parseOffline('set an alarm for 6 am', now)!;
    expect(a.intent).toBe('set_alarm');
    expect(a.parameters.datetime).toBe('2026-11-28T06:00');
    expect(parseOffline('wake me up at 5:30 am every day', now)?.parameters).toMatchObject({
      datetime: '2026-11-28T05:30',
      recurrence: 'daily',
    });
    expect(parseOffline('सुबह 7 बजे का अलार्म लगाओ', now)?.intent).toBe('set_alarm');
    expect(parseOffline('set an alarm', now)?.missing_information).toContain('time');
    expect(parseOffline('remind me to take medicine at 8 pm', now)?.intent).toBe('create_reminder');
  });

  it('understands timer lengths', () => {
    expect(parseOffline('set a timer for 10 minutes')?.parameters.duration_seconds).toBe(600);
    expect(parseOffline('timer for 1 hour 30 minutes')?.parameters.duration_seconds).toBe(5400);
    expect(parseOffline('start a timer for half an hour')?.parameters.duration_seconds).toBe(1800);
    expect(parseOffline('5 मिनट का टाइमर लगाओ')?.parameters.duration_seconds).toBe(300);
    expect(parseOffline('10 ನಿಮಿಷ ಟೈಮರ್ ಇಡು')?.parameters.duration_seconds).toBe(600);
    expect(parseOffline('set a timer')?.missing_information).toContain('duration');
  });

  it('takes notes', () => {
    expect(parseOffline('take a note buy milk and bread')?.parameters).toEqual({ note_text: 'buy milk and bread' });
    expect(parseOffline('note down that the plumber comes on Monday')?.parameters.note_text).toBe('the plumber comes on Monday');
    expect(parseOffline('make a note: call the bank')?.parameters.note_text).toBe('call the bank');
    expect(parseOffline('दूध लाना है नोट करो')?.parameters.note_text).toBe('दूध लाना है');
    expect(parseOffline('take a note')?.missing_information).toContain('note_text');
    expect(parseOffline('open notes')?.intent).not.toBe('create_note');
  });
});

describe('media, search, directions and torch', () => {
  const p = (s: string) => parseOffline(s);

  it('plays in the named app, or leaves the app to ROOSTER', () => {
    expect(p('play Arijit Singh songs')?.parameters).toEqual({ query: 'Arijit Singh songs' });
    expect(p('play cooking videos on YouTube')?.parameters).toEqual({ query: 'cooking videos', app_name: 'YouTube' });
    expect(p('play bhajans on YouTube Music')?.parameters).toEqual({ query: 'bhajans', app_name: 'YouTube Music' });
    expect(p('play some old Kishore Kumar songs on spotify')?.parameters).toEqual({ query: 'old Kishore Kumar songs', app_name: 'Spotify' });
    expect(p('यूट्यूब पर भजन चलाओ')?.parameters).toEqual({ query: 'भजन', app_name: 'YouTube' });
    expect(p('ಯೂಟ್ಯೂಬ್‌ನಲ್ಲಿ ಭಜನೆ ಪ್ಲೇ ಮಾಡಿ')?.parameters).toEqual({ query: 'ಭಜನೆ', app_name: 'YouTube' });
    expect(p('play songs from the 90s')?.parameters).toEqual({ query: 'songs from the 90s' });
  });

  it('controls whatever is playing', () => {
    expect(p('pause')?.parameters.control).toBe('pause');
    expect(p('stop the music')?.parameters.control).toBe('pause');
    expect(p('next song')?.parameters.control).toBe('next');
    expect(p('play again')?.parameters.control).toBe('play');
    expect(p('volume up')?.parameters.control).toBe('volume_up');
    expect(p('आवाज़ कम करो')?.parameters.control).toBe('volume_down');
    expect(p('ಮುಂದಿನ ಹಾಡು')?.parameters.control).toBe('next');
    expect(p('stop')?.intent).toBe('stop_speaking');
    expect(p('say that again')?.intent).toBe('repeat_last_response');
  });

  it('searches Google or a named app', () => {
    expect(p('google best hospitals near me')?.parameters).toEqual({ query: 'best hospitals near me' });
    expect(p('search youtube for yoga for beginners')?.parameters).toEqual({ query: 'yoga for beginners', app_name: 'YouTube' });
    expect(p('search for walking shoes on Amazon')?.parameters).toEqual({ query: 'walking shoes', app_name: 'Amazon' });
    expect(p('मौसम गूगल पर सर्च करो')?.parameters).toEqual({ query: 'मौसम', app_name: 'Google' });
  });

  it('opens directions and the torch', () => {
    expect(p('directions to Lalbagh')?.parameters).toEqual({ query: 'Lalbagh' });
    expect(p('take me to the nearest hospital')?.intent).toBe('get_directions');
    expect(p('navigate to settings')?.intent).not.toBe('get_directions');
    expect(p('turn on the torch')?.parameters).toEqual({ state: 'on' });
    expect(p('टॉर्च बंद करो')?.parameters).toEqual({ state: 'off' });
  });

  it('handles "open <app> and play/search ..."', () => {
    expect(p('open spotify and play music')).toMatchObject({ intent: 'play_media', parameters: { query: 'music', app_name: 'Spotify' } });
    expect(p('open Spotify and play Arijit Singh songs')?.parameters).toEqual({ query: 'Arijit Singh songs', app_name: 'Spotify' });
    expect(p('open youtube and search cooking videos')).toMatchObject({ intent: 'search_app', parameters: { query: 'cooking videos', app_name: 'YouTube' } });
    expect(p('open YouTube and then play bhajans')?.parameters).toEqual({ query: 'bhajans', app_name: 'YouTube' });
    expect(p('यूट्यूब खोलो और भजन चलाओ')).toMatchObject({ intent: 'play_media', parameters: { query: 'भजन', app_name: 'YouTube' } });
    expect(p('open spotify and play')?.parameters).toEqual({ query: 'music', app_name: 'Spotify' });
    expect(p('open WhatsApp')?.intent).toBe('open_application');
  });

  it('still routes alarms, calls and app opening correctly', () => {
    expect(p('सुबह 7 बजे का अलार्म लगाओ')?.intent).toBe('set_alarm');
    expect(p('रमेश को फोन करो')?.intent).toBe('call_contact');
    expect(p('open YouTube')?.intent).toBe('open_application');
  });
});

describe('form filling command', () => {
  it('understands "fill this form" in three languages', () => {
    for (const s of ['fill this form', 'fill in the form', 'fill my details', 'autofill', 'फॉर्म भरो', 'ಫಾರ್ಮ್ ತುಂಬು']) {
      expect([s, parseOffline(s)?.intent]).toEqual([s, 'fill_form']);
    }
    expect(parseOffline('take a note fill the tank')?.intent).toBe('create_note');
  });
});

describe('reading messages on screen', () => {
  it('understands "read this message" and the language to translate into', () => {
    expect(parseOffline('read this message')).toMatchObject({ intent: 'read_screen', parameters: {} });
    expect(parseOffline('what does this message say')?.intent).toBe('read_screen');
    expect(parseOffline('read my whatsapp')?.intent).toBe('read_screen');
    expect(parseOffline('translate this message to Kannada')?.parameters).toEqual({ target_language: 'kn' });
    expect(parseOffline('read this message in Hindi')?.parameters).toEqual({ target_language: 'hi' });
    expect(parseOffline('यह मैसेज पढ़ो')?.intent).toBe('read_screen');
    expect(parseOffline('इसका हिंदी में अनुवाद करो')?.parameters).toEqual({ target_language: 'hi' });
    expect(parseOffline('ಈ ಸಂದೇಶ ಓದು')?.intent).toBe('read_screen');
    expect(parseOffline('ಕನ್ನಡಕ್ಕೆ ಅನುವಾದಿಸು')?.parameters).toEqual({ target_language: 'kn' });
  });

  it('keeps the camera reader and messaging separate', () => {
    expect(parseOffline('read this text')?.intent).toBe('read_text');
    expect(parseOffline('message Ravi saying hi')?.intent).toBe('prepare_sms');
  });
});

describe('phone settings and status (work offline)', () => {
  const p = (s: string) => parseOffline(s);

  it('switches settings on and off in three languages', () => {
    expect(p('turn off wifi')?.parameters).toEqual({ setting: 'wifi', state: 'off' });
    expect(p('switch on mobile data')?.parameters).toEqual({ setting: 'mobile_data', state: 'on' });
    expect(p('turn on bluetooth')?.parameters).toEqual({ setting: 'bluetooth', state: 'on' });
    expect(p('enable airplane mode')?.parameters).toEqual({ setting: 'airplane_mode', state: 'on' });
    expect(p('turn off location')?.parameters).toEqual({ setting: 'location', state: 'off' });
    expect(p('turn on hotspot')?.parameters).toEqual({ setting: 'hotspot', state: 'on' });
    expect(p('turn on battery saver')?.parameters).toEqual({ setting: 'battery_saver', state: 'on' });
    expect(p('turn on do not disturb')?.parameters).toEqual({ setting: 'do_not_disturb', state: 'on' });
    expect(p('वाईफाई बंद करो')?.parameters).toEqual({ setting: 'wifi', state: 'off' });
    expect(p('ब्लूटूथ चालू करो')?.parameters).toEqual({ setting: 'bluetooth', state: 'on' });
    expect(p('ಮೊಬೈಲ್ ಡೇಟಾ ಆಫ್ ಮಾಡು')?.parameters).toEqual({ setting: 'mobile_data', state: 'off' });
  });

  it('handles brightness, ringer and settings pages', () => {
    expect(p('brightness up')?.parameters).toEqual({ setting: 'brightness', state: 'up' });
    expect(p('full brightness')?.parameters).toEqual({ setting: 'brightness', state: 'max' });
    expect(p('ब्राइटनेस कम करो')?.parameters).toEqual({ setting: 'brightness', state: 'down' });
    expect(p('put the phone on silent')?.parameters).toEqual({ setting: 'ringer', state: 'silent' });
    expect(p('vibrate mode')?.parameters).toEqual({ setting: 'ringer', state: 'vibrate' });
    expect(p('turn off silent mode')?.parameters).toEqual({ setting: 'ringer', state: 'normal' });
    expect(p('फ़ोन साइलेंट करो')?.parameters).toEqual({ setting: 'ringer', state: 'silent' });
    expect(p('open bluetooth settings')?.parameters).toEqual({ setting: 'bluetooth' });
    expect(p('turn off auto rotate')?.parameters).toEqual({ setting: 'auto_rotate', state: 'off' });
  });

  it('answers status questions', () => {
    expect(p('how much battery is left')?.parameters).toEqual({ status_of: 'battery' });
    expect(p('बैटरी कितनी है')?.parameters).toEqual({ status_of: 'battery' });
    expect(p('ಬ್ಯಾಟರಿ ಎಷ್ಟಿದೆ')?.parameters).toEqual({ status_of: 'battery' });
    expect(p('is wifi on')?.parameters).toEqual({ status_of: 'wifi' });
    expect(p('am I connected to the internet')?.parameters).toEqual({ status_of: 'network' });
    expect(p('what time is it')?.parameters).toEqual({ status_of: 'time' });
    expect(p('कितने बजे हैं')?.parameters).toEqual({ status_of: 'time' });
    expect(p("what's the date today")?.parameters).toEqual({ status_of: 'date' });
  });

  it('does not steal other commands', () => {
    expect(p('remind me to turn off the wifi at 10 pm')?.intent).toBe('create_reminder');
    expect(p('search the internet for how to switch off a geyser')?.intent).toBe('search_app');
    expect(p('turn on the torch')?.intent).toBe('flashlight');
    expect(p('volume up')?.intent).toBe('media_control');
    expect(p('open settings')?.intent).toBe('navigate');
    expect(p('take a note wifi password is on the router')?.intent).toBe('create_note');
  });
});

describe('offline recogniser output (numbers as words)', () => {
  const now = new Date(2026, 10, 28, 10, 0);
  it('turns spoken numbers into digits', () => {
    expect(numberWordsToDigits('set a timer for ten minutes')).toBe('set a timer for 10 minutes');
    expect(numberWordsToDigits('alarm at six thirty a m')).toBe('alarm at 6:30 am');
    expect(numberWordsToDigits('remind me at eight p m')).toBe('remind me at 8 pm');
    expect(numberWordsToDigits('twenty five minutes')).toBe('25 minutes');
  });
  it('understands what Vosk writes', () => {
    expect(parseOffline('set a timer for ten minutes')?.parameters.duration_seconds).toBe(600);
    expect(parseOffline('set an alarm for six thirty a m', now)?.parameters.datetime).toBe('2026-11-29T06:30');
    expect(parseOffline('remind me to take medicine at eight p m', now)?.parameters.datetime).toBe('2026-11-28T20:00');
    expect(parseOffline('turn off why fi')?.parameters).toEqual({ setting: 'wifi', state: 'off' });
    expect(parseOffline('play one direction songs')?.parameters.query).toBe('one direction songs');
  });
});

describe('opening a person\'s chat', () => {
  const p = (s: string) => parseOffline(s);
  it('opens a WhatsApp chat with nothing typed', () => {
    const wa = { intent: 'open_chat', parameters: { contact_name: 'Ravi', channel: 'whatsapp' } };
    expect(p("open Ravi's WhatsApp chat")).toMatchObject(wa);
    expect(p('open WhatsApp chat with Ravi')).toMatchObject(wa);
    expect(p('open whatsapp with Ravi')).toMatchObject(wa);
    expect(p('open my chat with Ravi')).toMatchObject(wa);
    expect(p('open Ravi chat on WhatsApp')).toMatchObject(wa);
    expect(p('रवि की व्हाट्सएप चैट खोलो')).toMatchObject({ intent: 'open_chat', parameters: { contact_name: 'रवि', channel: 'whatsapp' } });
    expect(p('व्हाट्सएप पर रवि की चैट खोलो')?.parameters.contact_name).toBe('रवि');
    expect(p('ರವಿ ಅವರ ಚಾಟ್ ತೆರೆ')).toMatchObject({ intent: 'open_chat', parameters: { contact_name: 'ರವಿ' } });
    expect(p('open sms messages with Ravi')?.parameters).toEqual({ contact_name: 'Ravi', channel: 'sms' });
  });
  it('leaves sending, the app and Conversation screen alone', () => {
    expect(p('WhatsApp Ravi saying hi')?.intent).toBe('prepare_sms');
    expect(p('open WhatsApp')?.intent).toBe('open_application');
    expect(p('open spotify and play music')?.intent).toBe('play_media');
  });
});

describe('media app choice', () => {
  const yt = 'com.google.android.youtube';
  const ytm = 'com.google.android.apps.youtube.music';
  it('finds the app the user named, preferring the longer name', () => {
    expect(findAppTarget('YouTube Music')?.key).toBe('youtube_music');
    expect(findAppTarget('youtube')?.key).toBe('youtube');
    expect(findAppTarget('Hotstar')).toBeUndefined();
  });
  it('uses YouTube unless the phone does not have it', () => {
    expect(pickPlayer(new Set([yt, ytm]))?.key).toBe('youtube');
    expect(pickPlayer(new Set([ytm]))?.key).toBe('youtube_music');
    expect(pickPlayer(new Set())).toBeUndefined();
  });
});

describe('toWhatsAppNumber', () => {
  it('adds the Indian country code to local numbers', () => {
    expect(toWhatsAppNumber('98450 11111')).toBe('919845011111');
    expect(toWhatsAppNumber('098450 11111')).toBe('919845011111');
    expect(toWhatsAppNumber('+91 98450 11111')).toBe('919845011111');
    expect(toWhatsAppNumber('+1 (415) 555-0100')).toBe('14155550100');
    expect(toWhatsAppNumber('0091 98450 11111')).toBe('919845011111');
    expect(toWhatsAppNumber('')).toBeNull();
  });
});

import { parseConfirmAnswer } from '../src/assistant/confirmWords';
import { needsConfirmation } from '../src/assistant/policy';

describe('spoken confirmation answers', () => {
  it('accepts natural yes answers in three languages', () => {
    for (const s of ['yes', 'Yes, call him', 'okay', 'haan karo', 'हाँ', 'जी हाँ', 'ಹೌದು', 'ಸರಿ ಮಾಡಿ']) {
      expect(parseConfirmAnswer(s).kind).toBe('yes');
    }
  });
  it('treats no / cancel as no, and no beats yes', () => {
    for (const s of ['no', 'cancel', 'nahi', 'नहीं', 'ಇಲ್ಲ', 'ಬೇಡ', 'yes no wait', 'haan nahi']) {
      expect(parseConfirmAnswer(s).kind).toBe('no');
    }
  });
  it('does not treat a long new command as a confirmation', () => {
    expect(parseConfirmAnswer('okay now remind me to take my tablet at eight tonight please').kind).toBe('other');
    expect(parseConfirmAnswer('what is the weather').kind).toBe('other');
  });
  it('picks choices by ordinal or name', () => {
    const choices = ['Ravi Son (3333)', 'Ravi Shankar (5555)'];
    expect(parseConfirmAnswer('the second one', choices)).toEqual({ kind: 'choice', index: 1 });
    expect(parseConfirmAnswer('पहला', choices)).toEqual({ kind: 'choice', index: 0 });
  });
});

describe('confirmation policy', () => {
  it('always confirms calls, SMS, SOS and deletes — even at the lowest level', () => {
    for (const i of ['call_contact', 'prepare_sms', 'emergency_help', 'delete_reminder'] as const) {
      expect(needsConfirmation(i, 'low', 1)).toBe(true);
    }
  });
  it('scales other actions with the confirmation level', () => {
    expect(needsConfirmation('create_reminder', 'low', 0.9)).toBe(false);
    expect(needsConfirmation('create_reminder', 'standard', 0.9)).toBe(true);
    expect(needsConfirmation('create_note', 'standard', 0.9)).toBe(false);
    expect(needsConfirmation('create_note', 'high', 0.9)).toBe(true);
    expect(needsConfirmation('create_reminder', 'low', 0.4)).toBe(true);
  });
});
