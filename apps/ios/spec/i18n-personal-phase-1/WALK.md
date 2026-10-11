# Phase 1 walk

No simulator / Xcode / Liuz17 / TestFlight operation in this task.
All device rows are NOT VERIFIED, including native language and permission prompts.

Automated English checks: locale selection/fallback; placeholder parity; 1/2 counts;
known feeling display with Chinese onChange storage; unknown feelings verbatim;
full weekday/date accessibility; viewer-offset date placement; month/unknown precision;
original bilingual note unchanged; playback/open separation and playing rerender.
Chinese existing regression suite runs with mocked zh-CN (no global text translation).

Native prebuild (Linux, production, --no-install): configuration generation only.
Observed CFBundleLocalizations zh-Hans/en, development region en, both languages'
Supporting/*.lproj/InfoPlist.strings with five purpose strings. No CocoaPods or linking.

Device acceptance (separate rebuilt client):
- Set Lampy App language to Chinese / English in iOS Settings, relaunch. Verify
  root tabs, empty Recent/Revisit, long mixed moments, date catalog, all precision scopes.
- Capture text + photos + audio + feeling; ordinary tap and long-press voice; permission
  denied/cancelled/background while pending. Save/reopen/restore draft without loss.
- Detail/back, expand/collapse, catalog/open/close, neighbors, pagination/retry and
  playback/pause/resume: no autoplay, no changed IDs, no lost position/progress.
- Enable lock; background/cold launch/Face ID and password/cancel: no private content
  exposure. English prompt and Chinese prompt in newly rebuilt native installation.
- Short screen, landscape/iPad, English long buttons and VoiceOver gesture reading;
  fixed font policy stays. Reduce Motion and FAB scrolling/forced hiding stay.
- Notes/unknown feelings and Chinese captions remain original in English UI.
- Settings/first-run/albums still awaiting phases 2/3; do not claim fully localized.

## Checks actually run
- TypeScript `npx tsc --noEmit`: PASS.
- Added English/resource tests: 2 suites / 8 tests PASS.
- Full suite `TZ=Asia/Shanghai npx jest --ci --runInBand --silent`:
  188 suites: 186 passed / 2 failed; 996 tests: 994 passed / 2 failed.
  No claim of full PASS. The two failures are life-page's obsolete root-tab
  expectation and life-album-detail-sheet's obsolete collected AX label.
- Exact base d76edf1 in separate checkout, SAME node_modules and TZ/command:
  those 2 files: 2 failures / 8 passes, same assertions and actual values.
- Changed-file ESLint: zero errors; pre-existing leave hooks / use-cases import
  ordering / lookback-chrome hook warnings remain. New i18n/tests/adapter lint clean.
- git diff --check: PASS.
- Production Linux iOS prebuild --no-install: PASS (native config generation only).
- Xcode 26.3 / simulator / real device / TestFlight: NOT VERIFIED.
