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
- [ ] Phase 5: categories, payment methods, budgets
- [ ] Phase 6: wishlist and savings goals
- [ ] Phase 7: local receipt attachments
- [ ] Phase 8: reports and PDF/CSV export
- [ ] Phase 9: settings, backup and restore
- [ ] Phase 10: Capacitor Android integration and APK packaging
- [ ] Phase 11: test and fix
- [ ] Phase 12: implementation documentation and final verification

## Acceptance approach

The automated suite covers money arithmetic, date-scoped reports, deletion effects, budget progress, CSV escaping, savings progress, and calendar generation. The production web build is run before Android sync. Android APK installation is reported only after an SDK build and device/emulator launch actually succeed.
