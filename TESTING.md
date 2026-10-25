# TULLIP verification

## Master update — 25 October 2026

Tests use isolated fixtures, fresh QA markers and a disposable read-only AVD.
No personal journal, saved AVD state or phone is reset. A passing unit test
does not establish native authentication, visual animation timing, export
delivery or physical-device behavior.

| Check | Actual result |
| --- | --- |
| Latest full web suite | PASS — clean `npm ci`, then 57 tests across 9 files |
| Rendered jar contract | PASS — 8 SSR tests included in the full suite |
| Production frontend | PASS — final build/sync including local pixel sky; PDF code loaded only for export |
| Browser first launch | PASS — empty-name validation, trimmed Unicode nickname, date/week preferences, introduction, skip tour and reload persistence |
| Native Java/app-lock instrumentation compilation | PASS — final app and test APK assembly and host unit task succeeded |
| Native v1 upgrade, account/jar scenario and restart | NOT VERIFIED — tests authored, runtime pending |
| Native credential authentication/lifecycle | NOT VERIFIED — actual Android prompt exercise pending |
| Physical phone, TalkBack and full OS/device matrix | NOT VERIFIED |

The suite covers integer parsing and safe ranges, salary/cash/UPI accounts,
multiple allocations, partial/full/cross-account release, refill, correction,
reversal, duplicate submissions, backdated insolvency, linked purchases and
refunds, card liabilities and bill payments, shared monthly totals, exports,
real Dexie migration/reopen/rollback, safe restore, name validation, tour steps,
calendar density and rendered jar fill/ARIA/reduced-motion contracts.

## Commands

```powershell
npm ci
npm test
npm run build
npx cap sync android
```

Use the JDK/SDK/one-worker Gradle commands in `ANDROID_BUILD.md`, then install
the actual built app and test APKs. Run the named tests with explicit stages;
omitting opt-in parameters intentionally skips fixture-writing flows.

- `LegacyUpgradeInstrumentedTest#originalV1RowsSurviveActualApkUpgrade`:
  `legacyStage=create` against the preserved schema-1 APK; force-stop and
  upgrade via `adb install -r`; `legacyStage=verify` with the same fresh
  `legacyMarker=TULLIP_QA_...`. This preserves original payloads byte-for-byte.
- `MasterFlowInstrumentedTest#onboardingSavingsAndRestartThroughRealUi`:
  `masterStage=create`, explicit force-stop, then `masterStage=verify`, same
  fresh `masterMarker=TULLIP_QA_...`. Creates income, two jars, allocations and
  partial/full releases through actual controls; verifies SQLite persistence
  and displayed balances, jar fill, calendar, reports and preferences.
- `AppLockInstrumentedTest#realDeviceCredentialFlowOnDisposableEmulator`:
  `allowTemporaryDeviceCredential=true`, a generated ephemeral numeric
  `appLockTestPin`, `appLockStage=exercise`; force-stop; `appLockStage=restart`.
  Only a disposable emulator without an existing credential can opt in.
  Tests the real OS prompt, cancellation, incorrect credential, foreground
  return, restart and authenticated disable. Never use this on a phone.
- `ExampleInstrumentedTest`: package/backup flag, local dashboard and native
  SQLite launch smoke checks after onboarding has completed.

Actual runtime results, retries and environmental failures must be appended
after execution. Do not treat fixture source, skipped tests, installed APKs,
or a file existence check as evidence of a successful test.
