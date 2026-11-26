# ROOSTER — 3-minute demo script

**Before judging starts:**
- Backend running (`npm --prefix backend run dev`) and `adb reverse tcp:3000 tcp:3000` done. **Settings → Assistant server** shows ✓ Connected.
- One trusted contact saved (e.g. "Ravi", relationship "son") with a phone number you control.
- Phone volume up, battery saver off, ROOSTER set to "Unrestricted" battery use.
- Conversation history cleared, and no stale reminders.

| Time | Do | Say / show | Proves |
|---|---|---|---|
| 0:00 | Open ROOSTER on Home | "ROOSTER is a voice assistant for elderly and disabled users in India. One big button; everything is spoken." | Simple UI |
| 0:15 | Tap mic: **"What can you help me with?"** | Spoken AI answer appears with the Listening → Thinking → Speaking states | **W1** voice → AI → speech |
| 0:35 | Tap mic: **"Remind me to take my BP tablet in 2 minutes"** (or set the time on the Reminders screen) | Confirmation dialog → "Yes" → reminder listed | **W2** created by voice |
| 0:55 | Settings → Accessibility: choose **Extra large** text, **Maximum** contrast, **Very simple words**, lower the speed | The preview and the whole app change immediately | **Adaptive engine** |
| 1:15 | Tap mic: **"Mujhe aaj kya karna hai?"** / switch language to Hindi or Kannada and ask "आज मेरे रिमाइंडर क्या हैं?" | Answer spoken in Hindi, in simpler words | Multilingual + simple mode |
| 1:35 | Home → Read text → Take photo of a medicine strip / notice | Text appears in very large type and is read aloud; pause and resume | **W3** camera OCR → speech |
| 2:00 | Tap mic: **"Call my son"** | "Shall I call Ravi?" → say **"Yes"** → dialler opens with the number | **W4** confirmed communication |
| 2:20 | **Reminder fires** (from 0:35) — even with the app in the background | Notification + spoken reminder | **W2** delivered on time |
| 2:35 | Say **"Help"** | SOS countdown with a large Cancel button → tap Cancel → "Nothing was sent" | Safe SOS, easy cancel |
| 2:50 | Turn on airplane mode, say **"Call Ravi"** | Still works, marked "Offline mode" | Offline-first honesty |

**If asked "Does it call automatically?"**: No, by design. ROOSTER opens the dialler or SMS app with everything filled in, and the user makes the final tap. That is what Android allows without restricted permissions, and it keeps the user in control.
