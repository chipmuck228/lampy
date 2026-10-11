# Verification

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
