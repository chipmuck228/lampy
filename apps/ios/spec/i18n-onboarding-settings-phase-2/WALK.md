# Phase 2 checks

Implementation base: local `f02c3d3` (same tree as #88 remote `584d3c5`).

- `npx tsc --noEmit`: PASS.
- Phase 2 English + Chinese settings targeted suites: PASS (3 suites / 16 tests).
- Full Jest, `TZ=Asia/Shanghai npx jest --ci --runInBand --silent`: 189 suites, 187 passed / 2 failed; 1000 tests, 998 passed / 2 failed. Both failures are the baseline assertions previously reproduced on main `d76edf1`: life-page expects two root tabs despite Albums; life-album-detail-sheet expects an obsolete selected-album accessibility label. No new failing suite.
- Changed implementation ESLint: PASS, no errors.
- `git diff --check`: PASS.
- English tests cover heading/accessibility copy, progress, unchanged explicit final completion, system-font selection without loading Chinese subsets, bundled terms date and return route, no-purchase wording and qualified backup/facial-data statements.

## NOT VERIFIED
Actual English/Chinese welcome pages, short-screen overflow and swipe, animation/Reduce Motion, Settings scrolling and return, native system-font rendering, VoiceOver, app-lock masking and offline reading on a simulator or device. No iOS build, personal-device data access, TestFlight upload or merge was performed.

English diagnostics while enabled and bilingual albums/native paper remain outside this slice. Legal notices remain candidate copy.

## User device report, 2026-10-08
User reports PASS for core button/date/count/playback translations, English Settings returns and scrolling, unchanged original content/media, and protection during foreground authentication. Test workspace started from #89 `fe0ca54` and locally merged #87 build compatibility fixes. Native build fingerprint and final merged working tree were not independently inspected. Welcome pages were not part of this report.

Two observed English visual issues are corrected after that test: both neighbor captions explicitly break before “with moments”; composer keeps horizontal icon/label actions with tighter 12pt gaps and a conservative Latin width allowance. Narrow columns retain stacking. No font shrinking or recording/save/navigation behavior changes. These two corrections still need device retest.
