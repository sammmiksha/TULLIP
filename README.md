# TULLIP

TULLIP is a calm, local-first personal finance journal. It works without an
account, bank connection, analytics, cloud sync, ads, or remote user-data
service. The same React application runs in a browser during development and
is packaged for Android with Capacitor.

## What it does

- Record income, expenses, and transfers; browse, search, filter, edit, and
  remove journal entries.
- Use a date-aware calendar, monthly dashboard, category/payment-method
  breakdowns, budgets, and reports.
- Track wishlist targets and separate savings contributions. A contribution is
  planning progress, not an expense, so cash-flow totals stay accurate.
- Attach an image receipt to a transaction. Browser development stores a local
  data URL in IndexedDB; Android writes the image to app-private storage.
- Export a month as CSV or PDF, and export/merge a JSON backup.

All monetary fields in the domain are integer paise (`amountMinor`,
`targetMinor`, `openingBalanceMinor`). User-entered amounts are parsed into
paise before they are stored; totals, budgets, exports, reports, and balances
all use those integers.

## Local storage and privacy

The browser adapter stores the journal in IndexedDB. On Android, the repository
selects SQLite through `@capacitor-community/sqlite`; attachment bytes live in
Capacitor's app-private `Directory.Data`. No adapter sends data over the
network.

Backups are intentionally a user action. Restores merge new record IDs only,
do not silently replace settings, and validate the TULLIP v1 envelope and
integer money fields before writing anything.

The repository ignores receipts, SQLite files, backups, keystores, APKs/AABs,
environment files, and local Android build/configuration output. Keep exported
backups in a private location outside the repository.

## Development

```powershell
npm install
npm run dev
```

Run the checks with:

```powershell
npm test
npm run build
```

The suite covers minor-unit arithmetic, date-scoped reporting, transfers,
budget and savings progress, calendar edge cases, CSV escaping/non-mutation,
and backup validation/deduplication.

## Android

The Capacitor project uses app ID `com.tullip.journal`. After Android tooling
is installed and an emulator or device is available, package and launch it
with:

```powershell
npm run cap:sync
cd android
.\gradlew.bat assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
adb shell monkey -p com.tullip.journal 1
```

An APK is not considered built or tested until the Gradle build succeeds and
the final command launches it on an emulator or physical device.

## Verification status

Web tests and the production build are passing. Android Capacitor sync is
verified, but Android APK packaging and launch are blocked in the current
environment: no Android SDK/`adb`/`sdkmanager` is configured, and the Gradle
wrapper distribution download timed out. See `IMPLEMENTATION_PLAN.md` for the
phase checklist.
