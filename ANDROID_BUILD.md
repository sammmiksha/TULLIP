# TULLIP Android build and public distribution

## Project audit — 24 October 2026

| Item | Verified configuration |
| --- | --- |
| Framework | React, TypeScript, Vite |
| Android packaging | Existing Capacitor Android project; Gradle wrapper 8.14.3; Android Gradle Plugin 8.13.0 |
| Lockfile | `package-lock.json`; install with `npm ci` |
| Scripts | `build`, `test`, `cap:sync`, `android:debug` in `package.json` |
| Application ID | `com.tullip.journal` |
| Display name | TULLIP |
| Version | Master update: project/Settings/Android `0.2.0`, versionCode `2`; application ID and debug signing preserved |
| Icon | Existing stock Capacitor blue icon; `android/app/src/main/res/mipmap-*/ic_launcher.png` and adaptive resources |
| Android configuration | Minimum API 24 (Android 7.0), target/compile API 36; runtime testing does not cover every supported OS version |
| Runtime data | Native SQLite and app-private receipts; browser IndexedDB fallback; integer minor units |
| Tooling | JDK 21, Android SDK APIs 36 and 36.1, Build Tools 35/36, platform-tools, emulator, Gradle available; Android Studio and `sdkmanager` were not found |
| Git | `sammmiksha/TULLIP`, public; working branch `build/tullip-v1`; existing tags/releases: none at audit time |
| GitHub access | Authenticated repository administrator; release publication permitted |
| Phone | No physical phone connected at audit time |

The original APK declared Android versionName `1.0`, although its web project
used `0.1.0`. The master update uses versionName `0.2.0` and increments Android
versionCode to `2`, so an update can preserve the installed journal when the
signing certificate matches.
Capacitor bridge logging is disabled so local financial payloads are not
written into its debug logs. Schema migration 2 adds accounts and optional
onboarding fields, preserving original transaction and contribution payloads.

## Task status

| Check | Status |
| --- | --- |
| Existing source/configuration audit | PASS |
| Locked dependency install and fresh frontend build | PASS — `npm ci`, 57 tests, production build and sync |
| Fresh Android debug APK and metadata/signature/checksum | NOT VERIFIED — pending current run |
| Transaction creation and persistence after process restart | NOT VERIFIED — pending current run |
| Calendar and core screen checks | NOT VERIFIED — pending current run |
| Physical-phone installation | NOT VERIFIED — no connected phone |
| Public GitHub Release and anonymous download | NOT VERIFIED — pending publication and verification |
| Website | No website requested or deployed |

Generated APKs, tool downloads, caches, logs, databases, private receipts,
backups, environment files, and signing keys remain outside Git. Release
assets will be uploaded to GitHub Releases, not committed to the source tree.

## Reproducible build

Use JDK 21 and the installed Android SDK. Do not use the unrelated Oracle
`java` shim on PATH on this host. The project wrapper is Gradle 8.14.3 with a
pinned distribution checksum. Build before starting an emulator on this
memory-constrained machine.

```powershell
Set-Location C:\projects\TULLIP
$env:JAVA_HOME = 'C:\projects\TULLIP\.local-tools\java21\jdk-21.0.12.1+1'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
npm ci
npm test
npm run build
npx cap sync android
Set-Location android
.\gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest :app:testDebugUnitTest --no-daemon --max-workers=1 '-Dorg.gradle.jvmargs=-Xmx768m -XX:ActiveProcessorCount=2 -XX:ReservedCodeCacheSize=128m' --console=plain
Test-Path app\build\outputs\apk\debug\app-debug.apk
```

An APK existing on disk alone does not prove that it runs. Check its actual
`aapt dump badging` metadata, `apksigner verify --verbose --print-certs`, file
size and SHA-256, then install and launch the same artifact on an emulator or
device. The prior artifact is preserved under ignored
`.local-tools/previous-apk/tullip-before-master-brief.apk`.

## Phone installation

1. Make a private backup from the installed TULLIP before updating. Keep any
   receipt files separately; the JSON backup contains their metadata, not the
   app-private Android image bytes.
2. Copy the APK to the phone by USB, or use the verified release asset link
   once publication is recorded below. Open it from Files or the browser's
   Downloads list.
3. If Android asks, allow **Install unknown apps** for that specific Files or
   browser app. Install the update, then turn that source permission off again.
   Android 7 uses the older Unknown sources setting. Keep Play Protect on.
4. Open TULLIP. Test with a small disposable record first, close/reopen, and
   check the record remains. Verify the old records and receipts before relying
   on the update.
5. If Android reports an incompatible signature or policy restriction, keep
   the existing app and record the exact error. Do not uninstall a journal
   containing the only copy of its records to force an update.

These steps follow [Google's installation guidance](https://support.google.com/pixelphone/answer/7391672)
and [Android's distribution documentation](https://developer.android.com/distribute/marketing-tools/alternative-distribution).
Physical-phone installation is not claimed without an actual connected-phone run.

## Privacy and release limitations

- This is a debug testing APK. Native SQLite is not encrypted. Optional app
  lock uses the Android device credential and a native privacy shield; it is
  protection against casual access, not database encryption.
- The final logo was not supplied. The third reference is fully transparent;
  the new jar component is replaceable and the launcher retains its existing
  Capacitor placeholder icon.
- Runtime artifacts contain bundled frontend assets, libraries and the public
  signing certificate. Keystores/private keys, databases, receipt files,
  exports and personal fixtures must never be packaged or committed.
- jsPDF was upgraded to 4.2.1 and PDF output regression-tested. The production
  dependency audit found zero vulnerabilities at the earlier check; the three
  moderate remaining advisories concern the CLI's iOS `xcode`/`uuid` toolchain,
  which is not shipped in this Android APK. Final audit results are recorded
  with final verification.
- API 24 is the declared minimum. Runtime checks on Android 16 do not verify
  every supported OS, physical phone, text-scaling setting or OEM policy.

## GitHub Release and future download page

Publication and anonymous download verification remain **NOT VERIFIED** until
the final tested APK is uploaded and its actual API-returned URLs are recorded.
Only source and documentation go in Git; the APK and checksum belong in Release
assets on the already-authorized public `sammmiksha/TULLIP` repository.

For a future GitHub Pages page, link its download button to the verified,
versioned `browser_download_url` returned by GitHub, display the version and
checksum, and provide the release page as a fallback. Do not use an expiring
redirect URL or commit the APK into website files. Increment versionName and
versionCode for later builds and retain the private signing key outside Git.
No download website has been created or deployed in this task.
