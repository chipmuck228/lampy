# Verification — controlled public test API

Base main: 76586caf59c81312d1108f6b3ff7d177f75e9b05. Independent branch ios/family-controlled-public-auth. No server, simulator, Liuz17 or TestFlight operations.

- TypeScript: npx tsc --noEmit — PASS.
- Family API Jest: 22 suites / 151 tests — PASS, final targeted run.
- Whole App Jest: 218 suites, 216 passed / 2 failed; 1228 tests, 1226 passed / 2 failed. NOT whole-suite PASS.
- Baseline control: life-page.test.ts and life-album-detail-sheet.test.tsx reproduced the same two failures on pre-existing main-equivalent share-author-profile tree (6c5d34f); 2 suites failed / 2 tests failed / 8 passed. These two files and their implementation are unchanged by this PR.
- Changed-file eslint: no errors. Forced inspection of listen.ts exposes its pre-existing qrcode require warning; not hidden as a clean zero-warning run.
- git diff --check — PASS.

New auth tests cover fail-closed listener plan, IP parsing/trust, bounded admission with idempotent slot release, operator-only provisioning, public endpoint closures, generic auth failures, peer/account limits, all-session revoke vs disable, old self-registration/session rejection, migration 27 preservation and repeat application, real Node loopback HTTP + SQLite/CLI + persistent rate limits across restart. HTTP/SQLite tests are local automated tests, not public deployment or device acceptance.

Earlier integration test timed out when intentionally hashing many absent accounts with production Argon2 settings during concurrent full runs. Persistence test now uses actual operator-created credentials hashed with the explicit existing test fixture parameters; server verifier still reads the encoded hash. Production missing-account dummy hashing path remains production configuration, not weakened to make tests pass.

NOT VERIFIED: actual Caddy header overwrite, proxy spoofing end to end, public operator/login/revoke/disable paths, API runtime dependency audit, simulator/App expired-session UX, system VoiceOver, real devices, protection and invitation return under public mode. Public health 200 reported earlier used baseline 76586ca, not this implementation.

No upload, no automatic merge, no changes to old 8787 service or new deployed 8788 env. Next step after review is backing up isolated DB, updating code, migration 27, validating proxy header configuration, then controlled server acceptance. Separate App internal-build/UI work remains required before TestFlight.
