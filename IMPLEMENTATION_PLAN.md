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

## Master brief audit — 25 October 2026

This is an extension of the existing React/TypeScript/Vite + Capacitor app.
The checklist above records the original delivery, not verification of the
new master brief. Existing transactions, receipts, exports, navigation and
SQLite/IndexedDB adapters are preserved. The owner's reported phone testing
has not been independently repeated by this agent.

| Existing feature | Audit result |
| --- | --- |
| Integer paise, cash-flow totals, transfers excluded from income/expenses | PASS — existing domain coverage; new account reconciliation pending |
| Dashboard, journal, calendar, budgets, receipts, reports, PDF/CSV | PARTIAL — implemented; broader runtime regression pending |
| Wish jars | PARTIAL — old contributions are planning records without source accounts; no withdrawals or linked purchases |
| Accounts | NOT STARTED — optional transaction account fields exist, but no account entities/balances |
| Personalization, onboarding, walkthrough, app lock | NOT STARTED |
| Android | PARTIAL — prior emulator smoke tests passed; fresh master-brief APK and device testing pending |
| Git | PASS — branch `build/tullip-v1`; prior in-progress Android audit, dependency fix and lifecycle test changes preserved |

### Design reference interpretation

The star-in-glass jar supplies the silhouette, glass highlights, plum outline,
pink/lilac fill and buttercream star. Pixel desktop stickers supply crisp
folder/dialog edges, small hearts and sparkles. The lavender arcade and night
sky references supply periwinkle accents and quiet pixel cloud motifs. Cream
reading surfaces keep transaction lists clear; gingham belongs in welcome,
jar and empty-state panels. The third attachment contains no visible artwork.
No final logo asset was identified: the replaceable jar illustration is a
temporary component, and the existing Android launcher icon remains pending.

### Execution and verification tracker

The brief's execution order prioritizes accounting before visual polish.
Each row will be updated only after its checks run; old planning contributions
will never be silently treated as newly funded allocations.

| Work | Status | Evidence / remaining check |
| --- | --- | --- |
| Phase 0: audit and preserve baseline | PASS | Source/configuration read; previous APK copied to ignored local storage |
| Phase 7: account-aware allocations, withdrawals, purchases and migrations | NOT VERIFIED | In progress; isolated financial and migration tests required |
| Phase 10: consistent financial screens and exports | NOT VERIFIED | Pending integration and reconciliation checks |
| Phases 8/11: animated fill, goal history, milestones and empty states | NOT VERIFIED | Pending implementation |
| Phase 6: optional device-credential app lock | NOT VERIFIED | Pending native implementation and runtime tests |
| Phases 4/5/12: onboarding, walkthrough and preferences | NOT VERIFIED | Pending implementation and persistence checks |
| Phase 9: compact calendar indicators | NOT VERIFIED | Pending regression checks |
| Phases 1/2/13: shared palette, reference styling and accessibility | NOT VERIFIED | Pending UI and production-build checks |
| Phase 3: final supplied logo | NOT VERIFIED | Exact arcade PNG supplied 27 October; launcher/in-app integration in progress, package/render checks pending |
| Phase 14: tests and regression fixes | NOT VERIFIED | Pending final suite |
| Phase 15: fresh APK, installation and offline launch | NOT VERIFIED | Pending final SDK build and emulator/device verification |
| Phase 16: documentation and GitHub distribution | NOT VERIFIED | Pending verified artifact and results |

### Master update automated checkpoint

- PASS: fresh `npm ci` against the lockfile, 57 tests across 9 files,
  production frontend build and Capacitor sync, including the local pixel-sky
  decoration. Final Gradle app/test APK assembly and the host unit task passed.
- PASS: `npm audit --omit=dev` reports zero production vulnerabilities. Three
  moderate development/iOS toolchain advisories remain; no forced major update
  was applied.
- PASS: real Dexie v1 migration, close/reopen persistence, atomic rollback,
  legacy-fund reconciliation, allocations/releases/corrections/purchases/refunds,
  card liabilities, reports/exports and safe empty-journal restore coverage.
- PASS: actual rendered jar transform/opacity/ARIA values at 0/25/50/75/100%
  and overfunding, plus reduced-motion/decorative rendering contracts.
- PASS: browser first-launch empty-name validation, Unicode nickname trimming,
  local preferences, introduction, tour skip and reload persistence.
- NOT VERIFIED: actual SQLite upgrade, OS credential prompts, offline savings
  flow and process restart until the authored
  instrumentation tests execute. No physical phone is connected.

### Final logo — 27 October 2026

The owner supplied the lavender arcade image as TULLIP's final logo. This
supersedes the earlier placeholder requirement. Preserve the original PNG
without repainting or cropping; use it in the launcher, launch presentation,
header and onboarding. Android drawable padding must keep it inside adaptive
icon masks. Savings jars remain a separate progress illustration.

The owner also supplied a transparent tulip PNG on 27 October. Its original
500×500 file replaces the generated tulip decoration in the header, home
greeting, loading view and empty journal. Display frames omit only transparent
outer margins; the flower is not repainted or cropped. The arcade image
continues to serve as the Android launcher/splash logo and welcome illustration.
