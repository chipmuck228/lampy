# Walk: Home Screen Quick Actions

## Automated and configuration checks

- TypeScript `npx tsc --noEmit`: PASS.
- Focused Jest: 5 suites / 41 tests PASS (delivery, onboarding, lock cancellation, share content, draft preservation, recording and camera qualification).
- Full Jest: 192 suites, 190 passed / 2 failed; 1018 tests, 1016 passed / 2 failed. The two failures are the already independently reproduced main/baseline stale expectations in `life-page.test.ts` (two tabs vs three) and `life-album-detail-sheet.test.tsx` (old collected label). Full suite is not labelled PASS.
- Changed-source ESLint: 0 errors, 15 existing warnings in use-cases/leave. New quick-action files have no errors/warnings.
- `git diff --check`: PASS.
- `expo prebuild --platform ios --no-install`: PASS. Generated Info.plist has four static shortcuts; generated en/zh-Hans InfoPlist.strings use identifier-safe localization keys.
- Expo Apple autolinking resolve: PASS. Discovers LampyQuickActions pod, module and AppDelegate subscriber.

Prebuild/autolinking is configuration evidence, not Swift compilation or installation evidence. This environment has no Xcode/UIKit compiler. No simulator or user device has been run, and no TestFlight upload has been performed.

## Initial device checklist (before user reports below)

Record installed native build, JS SHA, device/iOS and app language. Rebuild and install; do not reset the user's records.

1. Chinese and English: four custom shortcuts show the expected titles and system icons. Check cold launch and warm/background launch separately.
2. Write: existing note/photos/sound survive; the restored text input is focused and the keyboard appears.
3. Camera: permissions granted/denied, cancel camera and full three-photo draft; no overwrite. Background during permission must not later open the camera automatically.
4. Record: restore then record once, stop/listen/save/play; existing draft audio refuses replacement. Permission denial and background during permission retain the normal fallback.
5. Protection enabled: shortcut cannot expose private records or start camera/recording behind authentication. Cancel authentication and later unlock: discarded action must not restart. New deliberate selection remains usable.
6. Share: system sheet shares only the public website; cancel preserves the current page and draft. Check iPad share presentation separately.
7. Disposable fresh install: shortcut waits through all onboarding screens, completion executes once, abandoning onboarding does not mark it complete.
8. Rapid repeated actions and composer already open: no duplicate composer stack, duplicate recording or overwrite. Existing FAB scroll visibility and long-press recording remain intact.
9. VoiceOver, iPad and real native scene/legacy delegate timing: NOT VERIFIED.

## User-reported device results and onboarding correction

Liuz17 / iOS26.2 / Release / Chinese and English, local integration SHA `8ba37872e07cb25c971bc5fbcb86df307ce39e2`: user reports PASS for cold/warm shortcuts, draft preservation and media limits, permission refusal/background cancellation, local protection/cancelled authentication, sharing only the website, existing composer reuse and FAB regressions. This integration SHA is distinct from PR head.

User's iPhone17ProMax / iOS26.3 simulator screenshots show the four English shortcut titles/icons correctly. They also exposed untranslated onboarding action labels: first/second screen Continue and final Capture a moment now go through tr(), shared by visible text and accessibilityLabel. Existing onboarding motion/navigation/completion are unchanged. tsc, onboarding/i18n Jest 5 suites/28 tests, changed-source eslint and diff check PASS. Updated onboarding screens need a fresh simulator run; not yet labelled runtime PASS. Onboarding-shortcut completion flow remains device NOT VERIFIED.


## Merge closeout — 2026-10-08

- User reports the corrected English onboarding buttons PASS on iPhone17ProMax simulator / iOS26.2. Simulator build SHA was not supplied; do not attach the earlier physical-device integration SHA to this later run.
- Physical-device shortcut/regression PASS remains tied to user-supplied integration SHA `8ba37872e07cb25c971bc5fbcb86df307ce39e2`, Liuz17 / iOS26.2 / Release / Chinese and English. Native compilation/install is thereby user-reported, not independently performed in this environment.
- Onboarding-completion shortcut execution, iPad and system VoiceOver remain NOT VERIFIED. The simulator report confirms translated onboarding controls, not all those paths.
- Final focused checks: tsc PASS; combined quick-action/onboarding/i18n Jest 9 suites / 65 tests PASS; focused ESLint and diff check PASS. Earlier full Jest remains 1016 pass / 2 baseline failures, not full PASS.
- Source review: four allowlisted IDs; one-use composer tokens; foreground/navigator/local-lock gates; camera permission recheck; no replacement of existing audio or full photo drafts; sharing uses public URL only; background clears tokens even before composer mount. No new blocking source issue found.
- GitHub at review head `39717b2`: OPEN→main, base `98ba119`, MERGEABLE/CLEAN, no submitted reviews or review comments. Cursor Bugbot NEUTRAL because usage limit prevented analysis; it is not a successful automated code review.
- This closeout changes documentation only. User authorized ordinary merge. No TestFlight upload, #87 merge, private-data reset or device operation is performed here.
