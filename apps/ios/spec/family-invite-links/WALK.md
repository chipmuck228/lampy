# Phase C evidence

## #93 ordinary merge

Expected head `7db90c748ebf565fdbd25a646ddc0194e8b84ba5`, merged as `0ce804c95a6658f0f998182cc8b1b5faf4d1a3c2`. TypeScript, changed lint, diff check passed. Full Jest: 196 suites, 194 passed / 2 baseline failed; 1040 tests, 1038 passed / 2 baseline failed. Existing failures: life-page paper color assertion, life-album-detail-sheet selected-sheet assertion. Existing user simulator evidence is preserved; no dual-physical-device result invented.

## Phase C actual checks (Linux, Node 24)

- TypeScript noEmit: PASS.
- Changed TS/TSX ESLint: PASS.
- New targeted tests: 5 suites / 17 tests PASS.
- Full Jest: 201 suites, 199 passed / same 2 baseline failed; 1057 tests, 1055 passed / same 2 failed. No new failures.
- Real SQLite: two independent connections compete for one token; one wins; no duplicate membership. Read-only preview/no-login/limit/revocation/expiry/dissolution, persistent failed-rate-limit, same-member retry, fresh invite after leave, hash-only bytes: PASS (automated, not device).
- Local HTTP server: public web headers, real PNG QR response, view does not join, explicit POST join/idempotent replay, default closed: PASS (automated, not public HTTPS).
- Application/page qualification: no acceptance on opening/login, closed/locked no reads, late background result ignored, changed account invalidates acceptance: PASS (Jest).
- iOS Metro export with controlled flags: PASS, 1396 modules. This is JS bundling, not Xcode/native/device installation.
- git diff --check: PASS.

## NOT VERIFIED

Simulator/native app actual invitation flow; QR decoding/scanning from external IM; installation/reopening; native Universal Links/AASA/provisioning; live Apple login during this flow; physical two-device acceptance; VoiceOver engine; short screen/landscape/iPad; device protection during invitation/login/share; public HTTPS invitation endpoints. No deployment, hosted migration, production accounts or TestFlight changes were performed. Family production entry stays closed; identityLoopAccepted remains false.

## Device checklist

1. A creator creates/shares; B member cannot create/list/revoke A's invitation.
2. External web/QR previews only. Uninstalled recipient sees truthful download/reopen instructions. Installed recipient gets the explicit invitation screen.
3. B signs in, returns, confirms once; C cannot consume an already-used slot. Current B repeats without a second membership.
4. Revoke/expiry/dissolve/full cap present accurate failure/retry; failure never masquerades as no family.
5. Cancel/lock/background before action, repeated tapping, account switch and late responses cannot initiate a new acceptance or reveal another account.
6. Local moments/album/audio paths remain usable. Authentication cover hides invite name/QR and family list.
7. Chinese/English controls and accessible hit targets, page scroll/short-screen landscape.
