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
- Record bank, cash and credit-card accounts separately from payment methods.
  Allocate money to wish jars, release it, correct history, and fund linked
  purchases without double-counting expenses. Animated fill reflects actual
  reserved money. Old planning contributions remain separate historical entries.
- Attach an image receipt to a transaction. Browser development stores a local
  data URL in IndexedDB; Android writes the image to app-private storage.
- Export a month as CSV or PDF, export savings history, and export/merge a JSON
  backup. Android opens its native share/save chooser; there is no automatic upload.
- Choose a local nickname and preferences, use a skippable walkthrough, and
  optionally protect the Android app with its actual device screen-lock credential.

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
preserve existing preferences, validate the v1/v2 envelope and financial ledger,
and write atomically. An empty target restores the backup's currency and starting
funds. Android receipt bytes need a separate private copy; JSON includes metadata.

Migration 2 adds accounts without rewriting old transaction/contribution
payloads. Historical funds remain unassigned until explicitly reconciled into
a bank or cash account. See [DATA_MODEL.md](DATA_MODEL.md) for accounting,
refunds, safe corrections and upgrade behavior. The SQLite database is not
encrypted; optional app lock protects casual access and stores no credential.

The repository ignores receipts, SQLite files, backups, keystores, APKs/AABs,
environment files, and local Android build/configuration output. Keep exported
backups in a private location outside the repository.

## Development

```powershell
npm ci
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

The Capacitor project uses app ID `com.tullip.journal`, Android API 36, and
Gradle 8.14.3. Use JDK 21: the installed Capacitor plugins require a Java 21
toolchain, and the wrapper does not support running on Java 25. Set
`JAVA_HOME` to your JDK 21 directory and `ANDROID_HOME` to your Android SDK
directory in the PowerShell session. Add the SDK's `platform-tools` directory
to `PATH` for `adb`.

With an emulator or device available, package and launch it with:

```powershell
npm run android:debug
Test-Path android\app\build\outputs\apk\debug\app-debug.apk
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -W -n com.tullip.journal/.MainActivity
```

An APK is not considered built or tested until the Gradle build succeeds and
the final command launches it on an emulator or physical device. The wrapper
uses the smaller binary distribution with a pinned SHA-256 checksum. If
Gradle's download client cannot reach the distribution server, a separately
downloaded archive must match that checksum before it is placed in the
wrapper cache.

On a machine with limited memory, build before starting the emulator and use
one worker:

```powershell
npm run android:debug -- --max-workers=1 "-Dorg.gradle.jvmargs=-Xmx768m -XX:ActiveProcessorCount=2 -XX:ReservedCodeCacheSize=128m"
```

Android smoke tests check the app package, disabled system backup, dashboard
loading, and creation of the native SQLite database:

```powershell
cd android
.\gradlew.bat :app:assembleDebugAndroidTest --max-workers=1
# Start the emulator after Gradle exits on machines with limited memory.
adb install -r app\build\outputs\apk\debug\app-debug.apk
adb install -r -t app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk
adb shell am instrument -w -r com.tullip.journal.test/androidx.test.runner.AndroidJUnitRunner
```

System cloud backup and automatic device transfer are explicitly disabled for
the journal, receipts, and preferences. Moving data is a manual export/restore
operation.

## Verification status

The master-brief update is version **0.2.0**, Android versionCode **2**, on
`build/tullip-v1`. Intermediate domain/storage/UI tests and the production
build pass. Fresh final Android build, upgrade, app-lock and device results
are tracked in [ANDROID_BUILD.md](ANDROID_BUILD.md) and [TESTING.md](TESTING.md).
The following paragraph records the previous build, not the new update:

Web tests (11), the production build, Capacitor sync, Android SDK packaging,
APK installation, and two offline Android 16 emulator smoke tests passed.
The verified debug artifact is
`android/app/build/outputs/apk/debug/app-debug.apk`; generated APKs are not
committed to Git.

The low-memory test environment required separate build/emulator runs and
temporarily disabling busy Google background packages inside a read-only
AVD. Its saved state was preserved. Physical-device testing and a full Android
regression matrix have not been performed. Android System UI/launcher ANR
dialogs continued in that constrained emulator, so uninterrupted manual UI
stability remains NOT VERIFIED despite the passing launch/database tests.
See `IMPLEMENTATION_PLAN.md` for the verification details and phase checklist.
