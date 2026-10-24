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

Web tests (11), the production build, Capacitor sync, Android SDK packaging,
APK installation, and two offline Android 16 emulator smoke tests passed.
The verified debug artifact is
`android/app/build/outputs/apk/debug/app-debug.apk`; generated APKs are not
committed to Git.

The low-memory test environment required separate build/emulator runs and
temporarily disabling busy Google background packages inside a read-only
AVD. Its saved state was preserved. Physical-device testing and a full Android
regression matrix have not been performed. See `IMPLEMENTATION_PLAN.md` for
the verification details and phase checklist.
