# TULLIP implementation plan

## Phase 0 audit — 24 October 2026

| Check | Result |
| --- | --- |
| Repository | Empty directory; no existing source, Git metadata, documentation, or user data was found. |
| Runtime | Node.js v22.17.0 and npm v10.9.2 are available. Java/JDK 25 is on PATH. |
| Android tooling | `adb`, Gradle, `sdkmanager`, Android SDK environment variables, and an emulator/device were not found. APK compilation and installation are therefore blocked until Android SDK tooling is installed. |
| Existing dependencies/assets | None. |

## Architecture decisions

- React + TypeScript + Vite provides the interface; Capacitor packages the same build for Android.
- Financial values are integer minor units. The domain layer is the sole source for totals, budgets, reports, and balances.
- The browser/development adapter uses IndexedDB. The Android adapter is designed for `@capacitor-community/sqlite`; it is selected by the repository facade when the native platform is available.
- Receipts are separate attachment records. On Android the attachment service writes into app-private `Directory.Data`; in the browser, a local IndexedDB data URL is used only as a development fallback.
- No backend, login, analytics, or remote asset dependency is introduced.

## Delivery checklist

- [x] Phase 0: audit and plan
- [x] Phase 1: tokens, visual system, responsive navigation — PASS (automated tests and production build passed)
- [x] Phase 2: persistence, migrations, financial domain tests — PASS (financial tests and production build passed)
- [x] Phase 3: dashboard and transaction management — PASS (automated tests and production build passed)
- [x] Phase 4: interactive calendar — PASS (calendar domain coverage and production build passed)
- [x] Phase 5: categories, payment methods, budgets — PASS (budget calculation coverage and production build passed)
- [x] Phase 6: wishlist and savings goals — PASS (savings-progress coverage and production build passed)
- [x] Phase 7: local receipt attachments — PASS (receipt storage paths and credential/data exclusions verified; tests and production build passed)
- [x] Phase 8: reports and PDF/CSV export — PASS (CSV escaping and non-mutating export coverage passed; production build passed)
- [x] Phase 9: settings, backup and restore — PASS (backup-envelope validation coverage and production build passed)
- [x] Phase 10: Capacitor Android integration and APK packaging — PASS (SDK debug build, APK installation, and two offline Android 16 emulator smoke tests passed; dashboard rendering and native SQLite creation verified)
- [x] Phase 11: test and fix — PASS (11 automated tests and production build passed)
- [x] Phase 12: implementation documentation and final verification — PASS (11 automated tests and production build passed)

## Acceptance approach

The automated suite covers money arithmetic, date-scoped reports, deletion effects, budget progress, CSV escaping, savings progress, and calendar generation. The production web build is run before Android sync. Android APK installation is reported only after an SDK build and device/emulator launch actually succeed.

## Android verification — 24 October 2026

The SDK, platform tools, emulator, and an Android 16 AVD were found outside
PATH. Android API 36 and Build Tools 35.0.0 were installed using the existing
accepted SDK license. JDK 21 and the project's exact Gradle 8.14.3 distribution
were downloaded from official sources and checksum-verified; local tooling,
logs, screenshots, and generated APKs remain ignored by Git.

- PASS: `npm test` — 11 tests.
- PASS: `npm run build` and Capacitor Android sync.
- PASS: Gradle `assembleDebug :app:testDebugUnitTest` with JDK 21 and one worker.
- PASS: wrapper `:app:assembleDebugAndroidTest`.
- PASS: `Test-Path android/app/build/outputs/apk/debug/app-debug.apk`.
- PASS: APK metadata identifies `com.tullip.journal`, label TULLIP, minimum API 24,
  target API 36, and all four native ABIs.
- PASS: app and test APK installation on the Android 16 emulator.
- PASS: offline instrumentation run — `OK (2 tests)`, covering dashboard load,
  native SQLite database creation, application ID, and disabled system backup.
- NOT VERIFIED: uninterrupted manual UI use. The resource-constrained emulator
  continued showing Android System UI and launcher ANR dialogs while TULLIP's
  dashboard was rendered; the automated launch/database checks still passed.

The first concurrent build/emulator attempt exhausted host memory. Packaging
then passed with a 768 MB Gradle heap and one worker, followed by a separate
emulator run. The initial instrumentation process hit the emulator's system
startup timeout; after temporarily disabling busy Google background packages
inside the read-only AVD, the retry passed both tests. The AVD's saved state
was not changed, and the temporary emulator was shut down after verification.
This is debug-APK smoke verification on one emulator, not a physical-device or
full Android regression test matrix.
