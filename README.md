# ROOSTER — Adaptive AI Accessibility Assistant for India

ROOSTER helps elderly people and people with disabilities use an Android phone by voice, in English, Hindi and Kannada. They can call people, set reminders, have printed text read aloud and ask trusted contacts for help. An **Adaptive Accessibility Engine** changes the look, the speech and how often the app asks before acting, based on each user's needs.

> Prototype for a hackathon. The feature status table below lists what has been verified on a real phone and what has not.

## Architecture

```
React Native (TypeScript) UI
  └─ services/ ─ typed TurboModule specs (src/native/specs)
                   └─ Kotlin modules (android/app/src/main/java/com/rooster/app)
                        speech/     SpeechRecognizer + TextToSpeech + audio cues
                        reminders/  AlarmManager (setAlarmClock), boot/time-zone restore, notifications, spoken alerts
                        device/     contacts, ACTION_DIAL, ACTION_SENDTO (SMS), app launch, notification listener, location
                        ocr/        system camera / photo picker + ML Kit on-device OCR (Latin, Devanagari)

App ──HTTP──▶ Node/Express backend ──▶ Groq LLM
              returns a Zod-validated intent; never performs device actions
```

- **Personal data stays on the phone**: SQLCipher-encrypted SQLite, with the key held in Android Keystore-backed storage (`react-native-keychain`).
- **The AI only interprets requests.** The app checks every intent, and calls, SMS, SOS and deletions always need an explicit yes.
- **"Hey ROOSTER" wake word (optional, off by default)**: on-device Vosk keyword spotting (`android/.../wake/WakeWordService.kt`), so audio never leaves the phone. It triggers only on "hey / ok / hi rooster" when both words score ≥ 0.75 confidence, then hands the mic to the full speech recogniser and opens the animated avatar over the current app. To save battery it stops when the screen is off (default mode), in battery saver, and below 15% battery.
- **Spoken confirmation, no buttons**: after a voice command, ROOSTER asks "Shall I call Ravi?" and listens for yes or no by itself. Calls are placed and SMS sent directly only after a yes, and "sent" is reported only when Android confirms it. SOS sends automatically when its cancellable 5-second countdown ends.
- **Offline fallback**: a rule-based parser (`src/services/offlineParser.ts`) handles calls, messages, reminders, SOS, stop, repeat and navigation without internet. Reminders, text reading, text-to-speech and contacts all run on the device.

## Setup (Windows, PowerShell)

Requirements: Node 20+, JDK 17 (pinned in `android/gradle.properties`), Android SDK 36, an Android phone with USB debugging enabled.

```powershell
cd D:\ROOSTER
npm install
npm --prefix backend install

# 1. Backend: put your Groq key in backend\.env (copied from .env.example; never commit it)
npm --prefix backend run dev          # http://localhost:3000/health

# 2. Phone: let the phone reach the laptop's backend and Metro over USB
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8081 tcp:8081

# 3. Run the app
npx react-native run-android
```

Release APK: `cd android; .\gradlew.bat assembleRelease` → `android/app/build/outputs/apk/release/`.

To use a deployed HTTPS backend instead of `adb reverse`, change **Settings → Assistant server**.

## Tests

```powershell
npm test                      # app logic: contact matching, transliteration, dates, offline parser
npm run typecheck; npx eslint src
npm --prefix backend test     # backend: intent validation, safety enforcement, HTTP limits
```

## Permissions

| Permission | Why | When asked |
|---|---|---|
| RECORD_AUDIO | Voice commands | First tap on the microphone |
| READ_CONTACTS | Call or message by name | First time you ask to contact someone not already saved as trusted |
| POST_NOTIFICATIONS | Show reminders | First reminder |
| USE_EXACT_ALARM / SCHEDULE_EXACT_ALARM (≤ Android 12) | On-time medicine reminders | Granted at install |
| RECEIVE_BOOT_COMPLETED | Restore reminders after restart | Granted at install |
| ACCESS_FINE / COARSE_LOCATION | Optional map link in SOS | First SOS that includes location |
| CALL_PHONE | Place the call directly after the user says yes (falls back to the dialler if refused) | First voice call |
| SEND_SMS | Send the SMS / SOS directly after the user says yes (falls back to the SMS app) | First message or SOS |
| FOREGROUND_SERVICE_MICROPHONE | "Hey ROOSTER" listening, always with a visible notification | When the user turns the wake word on |
| SYSTEM_ALERT_WINDOW ("Display over other apps") | Open the avatar over other apps when it hears "Hey ROOSTER" | User grants it in Android settings |
| Notification access (system setting) | Read other apps' notifications | Only if the user turns it on and chooses apps |

Not requested: **CAMERA** (uses the system camera app), storage (uses the system photo picker), READ_PHONE_STATE, and AccessibilityService.

> Installing the APK from a file (not over USB) on Android 13+? Android may block the SMS permission as a "restricted setting". To allow it: App info → ⋮ → **Allow restricted settings**.

## Known limitations

- Kannada speech recognition and voices depend on the phone's Google speech services and installed voice data. The app detects a missing language and links to the settings where it can be installed.
- ML Kit has no Kannada text-recognition model. Kannada script is reported as unsupported rather than faked, and English or Hindi text on the same page is still read.
- After a phone restart, ROOSTER must be opened once to resume "Hey ROOSTER": Android 14 does not allow microphone services to start at boot.
- The wake word is English-only ("Hey ROOSTER"); commands after it can be in English, Hindi or Kannada.
- ROOSTER does not detect falls or emergencies and never contacts emergency services by itself.
- Some phone makers (OnePlus, Xiaomi and others) may delay alarms for battery saving. The Reminders screen warns about this and links to the setting that fixes it.
