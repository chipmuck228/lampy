# Verification (initial checks; later sections supersede device status)

Base: #104 merge 708fb8c7375e299b1df25adab789594a1420ca58.

- tsc --noEmit: PASS.
- Login/invite/config/release-policy Jest: 5 suites / 34 tests PASS.
- Final whole App run: 218 suites, 215 PASS / 3 FAIL; 1235 tests, 1232 PASS / 3 FAIL. Two known baseline failures (life-page, life-album-detail-sheet); an additional unchanged startup-overlay timing assertion failed in this full run. Standalone startup-overlay recheck: 1 suite / 12 tests PASS; implementation and test files unchanged. Full run remains NOT PASS.
- Node profile and archive-inspector tests: 7 tests PASS.
- Shell syntax and diff check: PASS.
- Expo public config evaluation: internal build/profile/API marker and bundle checked; not native prebuild or an archive.
- Changed-file lint: PASS, no warnings/errors in changed source/script/tests.

NOT VERIFIED: Xcode/prebuild/CocoaPods/Archive, codesign entitlement inspection on a real archive, Metro-independent cold launch, Chinese/English Release login/profile, public invitation login-return-and-confirm, expired/revoked session feedback, wrong-password/rate-limit UI, cancel/background/lock, protection during login and family reading, media/HEIC/audio, VoiceOver, TestFlight upload.

Device checklist: internal Release shows family entry; ordinary personal Release does not. Both operator accounts log in and retain separate families; no create-account or Apple alternative. Bad credentials and 429 have feedback; no automatic retry login. Invite remains after login/cancel, revalidated after returning, joins only on explicit confirmation. Profile saves nickname. Sign-out cancellation keeps identity; confirmed sign-out clears this device only; offline pending revoke is explained; local revoke-write failure keeps login. Revoke/disable session on server, return/retry: no stale family content. Authentication overlay covers login, names and family media on background return. Personal records/albums remain local and unchanged. Restart without Metro; compare installed build number to archive. No claim of device PASS.

## Public server update acceptance — 2026-10-11 (Asia/Shanghai)

User-run Ubuntu/Mac validation; deployed source 708fb8c7375e299b1df25adab789594a1420ca58 (#104 merge). Upload checksum comparison OK; previous deployed source 0883b4c. Backup: /srv/lampy-family-test/backups/before-708fb8c-20261011-171542. Volume guard passed, isolated service active, deployed SHA and local health verified. Public HTTPS health HTTP 200 with publicTestLogin=true, emailRegistration=false, testAccountLogin=false. Both operator test accounts logged in HTTP 200 and profile userId matched (user report). No passwords/tokens recorded.

Deployment/startup/health and normal login/profile smoke: PASS (user report). No new dependency/schema change; no dependency reinstall. No new concurrency/slow-body/mixed-method/spoofing acceptance was run on this deployed revision: regression coverage remains automated; earlier end-to-end rate-limit tests belong to 0883b4c. This does not verify the internal App Release UI, invitations, media, real-device protection, VoiceOver or TestFlight. #87 and #105 remain OPEN.

## Inline Settings Profile — 2026-10-11

- Previous eight Release device checks: PASS by user report; device/build/runtime
  SHA not provided. Performed before this UI update.
- Inline profile/save/logout, signed-out login returning to Settings, failed
  reads staying retryable: automated coverage added.
- TypeScript and changed-file ESLint PASS; targeted Jest 5 suites / 64 tests PASS.
- New Settings placement/keyboard/native protection device checks: NOT VERIFIED.
- No native dependency or build-profile changes; PR remains OPEN, no upload.

## Final pre-merge review — 2026-10-11 (Asia/Shanghai)

Reviewed implementation heads: #87 ce1a3f974cdf9afaf65d5f414570089f277bfd3e;
#105 3e7c56c9d03028ff1491f636a4f17196f4e3b180; main
708fb8c7375e299b1df25adab789594a1420ca58. Both PRs OPEN, MERGEABLE,
Bugbot SUCCESS, no inline review threads at review time. Local two-PR merge
completed without conflict. No new source blocker found; no PR merge/upload.

Checks actually rerun on combined tree: Node build tools 10/10 PASS;
TypeScript PASS; targeted Jest 7 suites / 74 tests PASS; changed source/script
ESLint PASS; shell syntax and git diff --check PASS. Expo public config
with internal Build 7 evaluated 0.1.0 (7), approved HTTPS API and both
invite-link/native-compat plugins. No whole-App test rerun; prior full-suite
failure history remains above. Linux checks are not CocoaPods/Xcode acceptance.

Physical-device evidence (user report): iPhone 17 Pro, iOS 26.2, Release
0.1.0 (7), clean worktree, runtime Git SHA
40fae1e4d0da88b15776289a79762b4f64747f09. Cold launch from Home without
Metro, Face ID background-return protection, and inline Settings nickname
save / confirmed sign-out / sign-in passed. Earlier eight-item acceptance
also passed by user report, but its individual running SHA was not supplied.
The reported Xcode-attached startup stall disappeared after stopping Xcode;
standalone cold launch/protection passed. Cause not diagnosed; no startup edit.

Runtime commit is local and not available from GitHub (422 commit not found).
Its parents/tree cannot be independently bound to the reviewed heads here.
Expected locally merged source tree before these docs-only updates:
21ac07dcc71e9d0e651c48be1e9e7bb0fcac9ae6. User can compare with
`git rev-parse '40fae1e4^{tree}'`; until matched, device evidence remains
user-reported integration evidence, not verified exact-head acceptance.

Still NOT VERIFIED: real Archive/codesign inspection, TestFlight installation,
system VoiceOver, AASA/Universal Link OS routing (distinct from manually
pasting an invite), server revoked/disabled-session UI. No public registration,
paid functionality or broader distribution approval implied.
