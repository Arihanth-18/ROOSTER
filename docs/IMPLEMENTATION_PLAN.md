# ROOSTER — Implementation Plan

Source of truth: the ROOSTER technical specification (React Native CLI + Kotlin native modules, Node/Express + Groq backend).

## Environment audit (2026-11-26)

| Item | Found | Action |
|---|---|---|
| Node / npm | 24.16.0 / 11.13.0 | OK |
| Git | 2.53 | OK |
| React Native | 0.88.1 (bare CLI, TypeScript, New Architecture, Hermes) | Scaffolded at `D:\ROOSTER` |
| JDK | `JAVA_HOME` = JDK 25 (too new for RN Gradle); JDK 17 + 21 also installed | Pinned Gradle to JDK 17 via `android/gradle.properties` (`org.gradle.java.home`) — global env untouched |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk`, platforms 33–36, build-tools 34–36, NDK 26 | `ANDROID_HOME` not set → written to `android/local.properties` |
| Android Studio | Installed | OK |
| Physical device | **None connected** | Needed from Phase 3 onward (USB debugging) |
| Disk | C: 23 GB free, D: 64 GB free | Project on D: ; build limited to `arm64-v8a` to save time/space |
| Groq API key | Not provided | Needed at Phase 3; goes in `backend/.env` only |

## Architecture

```
React Native UI (TS)  →  services/  →  typed native module interfaces  →  Kotlin modules  →  Android APIs
                       ↘ backend client → Node/Express → Groq → Zod-validated intent → command executor
```

The backend never performs device actions. The app validates every intent and confirms sensitive ones.

### Kotlin modules (android/app/src/main/java/com/rooster/app/)
- `speech/` — SpeechRecognizer (STT) + TextToSpeech, locale availability checks
- `reminders/` — AlarmManager exact alarms, BroadcastReceiver (alarm + BOOT_COMPLETED + TIME_SET/TIMEZONE_CHANGED), notification channel
- `contacts/` — ContactsContract query, ACTION_DIAL / ACTION_SENDTO intents, open app by label
- `notifications/` — NotificationListenerService (opt-in only)
- `ocr/` — ML Kit Text Recognition (Latin + Devanagari)
- `accessibility/` — system font scale, reduce-motion, haptics

### Storage
- SQLite (op-sqlite with SQLCipher) for reminders, notes, facts, trusted contacts
- Key generated once and stored with Android Keystore-backed encrypted storage
- Reminder alarms are mirrored natively so the boot receiver can restore them without JS running

## Phases (each must build + pass tests before the next)

1. **Audit & setup** — scaffold, JDK/SDK config, baseline debug build, git. ✅ in progress
2. **UI foundation** — navigation, theme tokens, AccessibilityProvider (text scale, contrast, AAA, touch targets, reduced motion), i18n (en/hi/kn), onboarding → language → accessibility setup with live preview, persistence.
3. **W1 voice** — speech module, backend (`/health`, `/api/assistant/interpret`, `/api/assistant/respond`), intent schema, executor, conversation screen, state machine Listening → Thinking → Speaking → Done/Error, offline fallback.
4. **W2 reminders** — reminders module, SQLite, recurring, reboot/timezone restore, permission flows, reminders screen.
5. **W3 text reader** — camera/gallery, ML Kit OCR, large text view, TTS controls, copy.
6. **W4 contacts** — contact matching (fuzzy, ambiguity resolution), confirmation dialog, dial/SMS intents.
7. **Remaining** — notes, facts, daily summary, SOS with countdown + location, notification reading, open app, voice navigation.
8. **Hardening** — device testing, TalkBack pass, release APK, README, feature status table, demo script.

## Decisions & honest limitations (to be verified on device)
- Kannada STT/TTS depends on Google speech services/voice packs on the device.
- ML Kit has no Kannada text-recognition model; Kannada OCR will be reported as unsupported rather than faked.
- Calls use ACTION_DIAL (user presses call) — no CALL_PHONE permission needed. SMS opens the SMS app prefilled; the user taps send.
- No continuous listening, no AccessibilityService device control, no automatic emergency-service calls.
