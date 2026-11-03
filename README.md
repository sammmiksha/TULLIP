# TULLIP

**TULLIP** is a calm, local-first personal finance journal for keeping track of
money, plans, and small wins. It runs in the browser while you develop and as a
native Android app when installed—without accounts, bank connections, adverts,
analytics, cloud sync, or a remote user-data service.

Version **0.3.0** adds a dedicated TULLIP PIN lock and clear, bank-style monthly
statements. Your journal remains yours: data is stored on the device and exports
are created only when you ask for them.

## Highlights

- **A complete daily journal** — record income, expenses, transfers, refunds,
  and receipt images. Browse, search, filter, edit, or remove entries whenever
  you need to correct something.
- **A clearer picture of your money** — use the calendar, dashboard, monthly
  reports, budgets, categories, payment methods, and separate bank, cash, and
  credit-card accounts.
- **Savings that match real life** — create wish jars, allocate or release
  funds, correct history, and link a purchase without counting the expense
  twice. The animated jar fill reflects money actually reserved.
- **Private, useful exports** — create a PDF or CSV statement with opening and
  closing balances, debits, credits, and a running balance; export savings
  history separately; or create and merge JSON backups. On Android, exports
  open the native share/save chooser.
- **A dedicated app lock** — on Android, protect the journal with your own
  four-digit TULLIP PIN. It locks when the app leaves the foreground, stores
  only a salted verifier, rate-limits repeated failed attempts, and blocks
  screenshots/screen sharing where Android supports it.
- **A friendly personal space** — choose a local nickname and preferences, and
  take the optional walkthrough at your own pace.

The supplied arcade image is used for the Android launcher, splash screen, and
welcome view. The transparent tulip is used in the header, greeting, loading
view, and empty journal; the original assets remain in `src/assets`.

All monetary fields in the domain are integer paise (`amountMinor`,
`targetMinor`, `openingBalanceMinor`). User-entered amounts are parsed into
paise before they are stored; totals, budgets, exports, reports, and balances
all use those integers.

## Local storage and privacy

The browser adapter stores the journal in IndexedDB. On Android, the repository
uses SQLite through `@capacitor-community/sqlite`; receipt bytes live in
Capacitor's app-private `Directory.Data`. No adapter sends journal data over the
network.

Backups are intentionally a user action. Restores merge new record IDs only,
preserve existing preferences, validate the v1/v2 envelope and financial ledger,
and write atomically. An empty target restores the backup's currency and starting
funds. Android receipt bytes need a separate private copy; JSON includes metadata.

Migration 2 adds accounts without rewriting old transaction/contribution
payloads. Historical funds remain unassigned until explicitly reconciled into
a bank or cash account. See [DATA_MODEL.md](DATA_MODEL.md) for accounting,
refunds, safe corrections, and upgrade behavior.

The SQLite database is not encrypted. The optional Android app lock protects
against casual access but does not replace device security or encrypt the
database. There is no account-based PIN recovery: keep a private backup, and
remember that clearing app data or uninstalling removes local records.

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
backup validation/deduplication, PIN protection, and statement exports.

## Android

The Capacitor project uses app ID `com.tullip.journal`, Android API 36, Gradle
8.14.3, and JDK 21. Set `JAVA_HOME` to a JDK 21 directory and `ANDROID_HOME`
to your Android SDK directory. Add the SDK's `platform-tools` directory to
`PATH` if you want to use `adb`.

With an emulator or device available, package and launch it with:

```powershell
npm.cmd run android:debug
Test-Path android\app\build\outputs\apk\debug\app-debug.apk
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -W -n com.tullip.journal/.MainActivity
```

`npm.cmd` avoids PowerShell execution-policy issues that can affect `npm` on
Windows. An APK is built when Gradle succeeds; it is fully smoke-tested only
after the final launch command works on an emulator or physical device.

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

The current build is version **0.3.0**, Android versionCode **3**. A fresh
production web build, Capacitor sync, and Android debug packaging completed
successfully on **November 3, 2026**. The latest debug APK is provided at
[`versions of tullip/tullip.apk`](<versions of tullip/tullip.apk>) for convenient
download and installation.

Fresh physical-device testing and a full Android regression pass have not been
performed for this build. See [ANDROID_BUILD.md](ANDROID_BUILD.md),
[TESTING.md](TESTING.md), and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
for detailed verification notes and the remaining checklist.
