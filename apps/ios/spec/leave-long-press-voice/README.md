# Long-press 留下 — issue #84

Base: main after PR #65 (`84a35405896dd183c15e1e314035e1d319e0a4a7`).

Tap stays unchanged. Hold the shared recent/lookback LeaveFab for 500ms to open
leave and start one recording after draft restoration, focus, foreground and unlock.
Release does not stop recording: use the existing 停止 and 留下 actions. VoiceOver
has the custom action 录一段声音; help explains the gesture. FAB visuals, scroll
thresholds/timing and catalog force-hide are unchanged.

A process-local issued token authorizes one attempt; arbitrary deep-link parameters
cannot start the microphone. Repeated gestures are debounced for one second.
Existing draft text/images/feeling stay intact; existing sound is never replaced.
Failed restoration does not authorize a new recording. Background or route blur
invalidates startup. A permission sheet's transient inactive may wait at most 10s
for active and unlocked after permission returns, without surviving background. Native capture
checks eligibility after preparation immediately before record(). Leaving an active
recording uses the existing interrupt-and-preserve path.

`expo-haptics ~57.0.3` is added: a light impact occurs only after successful gesture
recording startup; unavailable feedback is harmless. Rebuild the native app for this
dependency. Do not use Metro-only reload as haptic/native verification. The user built and tested this branch locally with Xcode 26.3. TestFlight Build 3
is unchanged; this feature has not been uploaded.

## Device verification — NOT VERIFIED

- Recent/lookback tap vs hold; release continues; stop/listen/save; saved clip plays.
- First microphone approval, refusal, cancellation and delayed return.
- Restore text/images; existing sound never overwritten; read failure recovery.
- Rapid repeat, leave during permission/preparation, background; no automatic restart.
- Face ID/password gate; masked content during authentication; no mic behind gate.
- VoiceOver gesture/action, real haptic, short/landscape/iPad.
- Existing FAB scrolling/catalog hide and manual recording, draft/save/playback regression.

Automated results are recorded in the PR description. No simulator/native build is
available in this Linux environment; automated PASS does not mean device PASS.

## Checks in this environment

- TypeScript: PASS.
- Targeted gesture/page/audio/foreground/feedback Jest: 8 suites / 71 tests PASS.
- Changed implementation lint: 0 errors; existing hook/import warnings retained.
- `git diff --check`: PASS for this change.
- Full Jest: see PR description for final counts. Two failures reproduce on an
  untouched `84a3540` checkout with the same dependencies: `life-page.test.ts`
  still expects a bottom band without 生活册; `life-album-detail-sheet.test.tsx`
  expects the old `一些日子，已在此册` label. No unrelated fixes were bundled here.

## User-reported real-device acceptance — 2026-10-07

Reported PASS: recent/lookback ordinary tap vs 500ms hold; release keeps recording;
stop/listen/save and playback; restored text/photo draft remains; existing sound is
not overwritten; microphone refusal still allows writing; background while permission
is pending does not later auto-start; local protection masks during authentication;
background interrupts active recording and preserves captured audio in the draft;
FAB scroll/catalog visibility stays unchanged.

Light haptic was not clearly perceptible: effect remains unconfirmed, not a device PASS.
Exact installed JS SHA, device and OS were not independently rechecked for this report.
System VoiceOver, short screen, landscape and iPad remain NOT VERIFIED. The checklist
above remains for paths not specifically covered by the report.

Pre-merge recheck: TypeScript PASS; targeted Jest 8 suites / 71 tests PASS (act warnings
remain); changed implementation lint and diff checks recorded in the PR. Earlier broad
suite baseline failures remain explicitly documented, not represented as full PASS.
