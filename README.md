# 🌷 TULLIP — Your Little Money Journal

<p align="center">
  <strong>Money today. Wishes tomorrow.</strong>
  <br/>
  A little money journal. A lot to look forward to.
</p>

<p align="center">
  <a href="https://tullip.patilsamiksha179.workers.dev/">🌐 Live Website</a>
  &nbsp; ✦ &nbsp;
  <a href="https://pub-1c60871b08584d4d8b63ed48dafb2bc8.r2.dev/TULLIP.apk">📱 Download Android APK</a>
</p>

---

## ✨ About TULLIP

TULLIP is a calm, personal finance journal designed to make managing money feel simple, personal and less overwhelming.

Track your everyday spending, manage your savings, create little financial goals and understand where your money goes — all in one place.

TULLIP is built around a **local-first philosophy**. Your financial information stays on your device. No account creation, bank connection, cloud sync, advertisements or remote user-data service.

A little progress is still progress. 🌱

## 🌸 Features

| Feature | What it does |
|---|---|
| 💰 Money Journal | Record, edit, search, filter and manage income, expenses and transfers |
| 📅 Calendar | Explore your transactions through a date-aware calendar |
| 📊 Dashboard | View monthly summaries, spending breakdowns and financial activity |
| 🏦 Accounts | Manage bank, cash and credit-card balances separately |
| 🫙 Wish Jars | Set savings goals, allocate money and track actual savings progress |
| 🎯 Budgets | Organise spending with category-based budgets |
| 🧾 Receipts | Attach receipt images to transactions |
| 📈 Reports | Understand monthly income, expenses and savings |
| 📤 Exports | Generate CSV and PDF reports and export JSON backups |
| 🌷 Personalisation | Set a nickname, preferences and a personalised journal experience |
| 🔐 App Lock | Optionally protect Android access using your device's screen-lock credential |

## 🛠️ Technology Stack

TULLIP uses a shared React application for browser development and Android packaging.

| Technology | Purpose |
|---|---|
| React 19 | User interface |
| TypeScript | Type-safe application development |
| Vite 7 | Development server and production build |
| Capacitor 8 | Native Android integration |
| SQLite | Native Android financial data storage |
| IndexedDB | Browser-local data storage |
| Dexie.js | IndexedDB database management |
| Capacitor Community SQLite | SQLite integration for Android |
| Capacitor Filesystem | Private receipt-image storage |
| Capacitor Camera | Image and receipt functionality |
| Capacitor Share | Native Android sharing and saving |
| Vitest | Automated testing |
| Gradle 8.14.3 | Android build system |
| Java 21 | Android build toolchain |

### 🏗️ Architecture

```text
                 TULLIP
                    │
             React + TypeScript
                    │
             Shared Application
                    │
          ┌─────────┴─────────┐
          │                   │
       Browser             Android
          │                   │
      IndexedDB              SQLite
          │                   │
      Local data         App-private files
```

The browser and Android versions share the same application logic while using platform-specific local storage adapters.

## 🔒 Privacy First

Your financial data belongs to you.

- No account registration.
- No bank-account connection.
- No analytics or advertising trackers.
- No cloud synchronisation.
- No remote user-data service.
- No automatic backup uploads.
- No automatic device-to-device transfers.

Browser data is stored locally using IndexedDB.

Android uses SQLite for journal records and app-private storage for receipt images.

Backups are created and restored manually. The SQLite database is not encrypted; optional app locking provides casual-access protection rather than database encryption.

## 💾 Data Management

TULLIP supports:

- Monthly CSV and PDF exports.
- Savings-history exports.
- JSON backup creation.
- Backup restoration and merging.
- Duplicate-record prevention.
- Financial-ledger validation.
- Atomic restore operations.

All financial amounts are stored as integer paise to avoid floating-point rounding errors.

## 🚀 Getting Started

### Prerequisites

- Node.js and npm
- Git
- JDK 21 for Android builds
- Android Studio and Android SDK for Android development

### 1. Clone the repository

```bash
git clone https://github.com/sammmiksha/TULLIP.git
cd TULLIP
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Start development

```bash
npm run dev
```

### 4. Run tests

```bash
npm test
```

### 5. Create a production build

```bash
npm run build
```

## 📱 Android Development

TULLIP uses Capacitor to package the shared React application for Android.

Android configuration:

- Application ID: `com.tullip.journal`
- Android API: 36
- Capacitor: 8
- Gradle: 8.14.3
- Java: 21

Set `JAVA_HOME` to your JDK 21 installation and `ANDROID_HOME` to your Android SDK directory.

Build the debug APK:

```powershell
npm run android:debug
```

Expected APK location:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install on a connected device:

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## 🧪 Testing & Verification

The automated test suite covers:

- Minor-unit financial calculations.
- Date-scoped reporting.
- Transfers and balances.
- Budget and savings progress.
- Calendar edge cases.
- CSV escaping and non-mutation.
- Backup validation and deduplication.

Android smoke tests cover application packaging, disabled system backup, dashboard loading and native SQLite database creation.

Physical-device testing and a complete Android regression matrix are not yet verified. Refer to `ANDROID_BUILD.md` and `TESTING.md` for detailed verification records.

## 📂 Project Documentation

| File | Description |
|---|---|
| `README.md` | Project overview and setup |
| `DATA_MODEL.md` | Financial data model and accounting behaviour |
| `ANDROID_BUILD.md` | Android build and verification instructions |
| `TESTING.md` | Testing procedures and results |
| `IMPLEMENTATION_PLAN.md` | Development phases and implementation details |

## 🌷 Project Philosophy

TULLIP is not about tracking every penny perfectly or making money management stressful.

It is about building awareness, developing better habits and making space for the things you wish to achieve.

Small steps. Soft encouragement. Your money, your pace.

**Made with 🌷 and a little bit of code.**

---

<p align="center">
  <strong>TULLIP — Money today. Wishes tomorrow.</strong>
  <br/>
  <a href="https://tullip.patilsamiksha179.workers.dev/">Visit TULLIP</a>
  &nbsp; ✦ &nbsp;
  <a href="https://pub-1c60871b08584d4d8b63ed48dafb2bc8.r2.dev/TULLIP.apk">Get the Android APK</a>
</p>
