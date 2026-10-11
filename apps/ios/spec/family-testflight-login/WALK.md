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
