# TULLIP website

Private, buildless static website inspired by the visual rhythm of
[Sparkle](https://sparkle.ankatms.com/), with original TULLIP copy, a labelled
sample money journal, interactive savings, feature tabs and Lumi, an original
generated tulip companion. The owner's arcade logo and decorative tulip are
preserved byte-for-byte.

`dist/` is intentional tracked website source. It is separate from the Android
app's generated root `dist/`; it never reads a real journal or stores demo state.
There are no analytics, third-party fonts, accounts, forms or cloud data APIs.
External links go to the actual GitHub project and its releases page. No APK
release existed when the availability copy was checked on 31 October 2026.

Run the example accounting checks:

```powershell
node --test website/demo.test.mjs
```

Preview `website/dist` with a local static HTTP server. No install or frontend
build step is required. `.openai/hosting.json` retains the existing private Site
identity. Source publication uses the Sites workflow with a separate ignored
checkout; credentials, archives and screenshots stay outside Git.

The optional custom Android PIN is described as casual-access protection. The
website does not claim database encryption or physical-phone verification.

## Verification — 31 October 2026

| Check | Result |
| --- | --- |
| Demo accounting | PASS — 5 Node tests: allocations, releases, target/zero guards, reserved-fund protection and reset |
| Browser interactions | PASS — savings, releases, expenses, target completion, reset, sample wish selection, four feature tabs and FAQ expansion |
| Keyboard/navigation | PASS — tab arrow-key navigation, mobile menu Escape dismissal and anchor selection |
| Responsive layout | PASS — inspected at 1280, 390 and 320 pixels; no horizontal document overflow at the checked widths |
| Assets, anchors and runtime | PASS — local images loaded, anchors resolve, module HTTP 200, no browser warnings/errors at final check |
| App regression | PASS — 68 tests across 10 files and production frontend build; website remains separate from app bundle |
| Deployment | PASS — owner-private Sites publication succeeded |
| Android custom-PIN runtime and physical phone | NOT VERIFIED by this website work |

Private website: https://tullip-wish-journal.satinygenet65.chatgpt.site

Published source commit in the private Site repository:
`c18bc586aa4ba0a76bd9e65ec3119c33cda3b909`.
The local website source is retained in the app workspace. It has not been
pushed to the public GitHub repository during this website delivery, respecting
the owner's request for a private preview. Screenshots and packaging archives
remain in ignored local storage.
