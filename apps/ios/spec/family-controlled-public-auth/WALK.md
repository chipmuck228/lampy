# Verification — controlled public test API

Base main: 76586caf59c81312d1108f6b3ff7d177f75e9b05. Independent branch ios/family-controlled-public-auth. No server, simulator, Liuz17 or TestFlight operations.

- TypeScript: npx tsc --noEmit — PASS.
- Family API Jest: 22 suites / 153 tests — PASS, final targeted run.
- Whole App Jest: 218 suites, 216 passed / 2 failed; 1228 tests, 1226 passed / 2 failed. NOT whole-suite PASS.
- Baseline control: life-page.test.ts and life-album-detail-sheet.test.tsx reproduced the same two failures on pre-existing main-equivalent share-author-profile tree (6c5d34f); 2 suites failed / 2 tests failed / 8 passed. These two files and their implementation are unchanged by this PR.
- Changed-file eslint: no errors. Forced inspection of listen.ts exposes its pre-existing qrcode require warning; not hidden as a clean zero-warning run.
- git diff --check — PASS.

New auth tests cover fail-closed listener plan, IP parsing/trust, bounded admission with idempotent slot release, operator-only provisioning, public endpoint closures, generic auth failures, peer/account limits, all-session revoke vs disable, old self-registration/session rejection, migration 27 preservation and repeat application, real Node loopback HTTP + SQLite/CLI + persistent rate limits across restart. HTTP/SQLite tests are local automated tests, not public deployment or device acceptance.

Earlier integration test timed out when intentionally hashing many absent accounts with production Argon2 settings during concurrent full runs. Persistence test now uses actual operator-created credentials hashed with the explicit existing test fixture parameters; server verifier still reads the encoded hash. Production missing-account dummy hashing path remains production configuration, not weakened to make tests pass.

Earlier pre-deployment gaps are superseded only by the public acceptance section below. Still NOT VERIFIED: API runtime dependency audit, simulator/App expired-session UX, system VoiceOver, real devices, protection and invitation return under public mode.

No upload or device operations by the implementation agent. User subsequently deployed the isolated 8788 service as recorded below. Separate App internal-build/UI work remains required before TestFlight.

## Public acceptance (2026-10-11, user-run Mac → Tencent Ubuntu)

Deployed source 0883b4c3317043ca314b56d79ebec4fc2240ae44, transferred archive SHA256 646ece10a241deac354b5103102b63c405a2d548e6e426c3a86c93fcb2c1ae0f. Migration 27 and operator_provisioned default 0 verified by user output. HTTPS health advertises controlled login on, registration off, legacy login off.

User-reported public PASS: A2/B login 200 and profile userId match; wrong password / unknown account same 401 AUTH_FAILED; registration 503 EMAIL_ACCOUNT_CLOSED; CLI revoke → old profile token 401; separate disposable account disable → old token 401 and correct-password login AUTH_FAILED; 429 after prior attempts; later A2/B login recovered; with fresh window, two normal logins + six wrong attempts using distinct emails and forged dedicated/XFF headers → seventh probe 429. This supports real source bucket enforcement for this direct-Caddy deployment.

Restart persistence: user was instructed to restart API and then supplied public 429; no restart output was supplied. Record 429 observed, restart itself USER-REPORTED WORKFLOW / not independently confirmed. No blanket public identity-loop or device PASS.

Passwords, tokens and raw account identifiers are not stored in this walk. Old disabled account and disposable account were not deleted.

## Pre-merge corrections

Bugbot identified method case inconsistency and a lingering socket idle timeout during queued Argon2. Auth qualification now uppercases methods consistently. Body timeout is a cancellable wall-clock timer, cleared immediately after readRawBody and on handler exit; no auth socket idle callback persists into hashing. Regression tests cover mixed method casing and clearing body deadline before delayed auth work. These corrections have NOT been installed on the public server; earlier evidence belongs to 0883b4c only.
