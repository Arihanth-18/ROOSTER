import { matchContact, normalizeName, type MatchableContact } from '../src/utils/contactMatch';
import { transliterateToLatin } from '../src/utils/transliterate';
import { nextOccurrence, occursOn, toLocalDateTime, parseLocalDateTime } from '../src/utils/dates';
import { splitForSpeech } from '../src/utils/textChunks';
import { parseOffline } from '../src/services/offlineParser';

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
