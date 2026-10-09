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

## User simulator report — 2026-10-08

Two simulators: iPhone 17 Pro Max / iOS 26.3 (`12595415-0F6B-4B9C-9407-69D29806E801`) and Lampy-family-second / iOS 26.5 (`4CD31657-C2FD-40AC-AD50-B31DA3F157C1`). Tester B generated an invitation and tester A received it. User reports the other previously listed scenarios passed: viewing/cancelling does not join, explicit joining/family count, repeated confirmation does not duplicate membership, revoked invitation ends. Recorded as simulator user report; installed native and running JS SHA not independently confirmed. Not a real-device/public-HTTPS result.

Issue: iOS Copy yielded two concatenated invitation URLs. Source supplied the same link in both `Share.share.message` and `.url`. Fix sends exactly one message item; link parsing remains strict and rejects concatenated links. Never store real invitation bearers in this WALK. Regression checks cover the actual page share call and concatenated-link rejection. After Reload, the user reports both simulators passed the Copy retest (runtime SHA not independently confirmed).

Copy-fix checks: actual-page share and link-parser tests 2 suites / 4 tests PASS; tsc, changed ESLint and diff check PASS. Full suite was not repeated for this one-field share change; preceding Phase C full-suite result above remains historical evidence.

## Invitation list follow-up

Pending invitations without the one-time link show that previously shared links remain valid. Replace and share asks confirmation, revokes the old invitation first, then creates and shares a single new link; revocation failure does not create/share. Creation uncertainty asks for a list refresh and does not silently retry. No bearer persistence added. Normal list control is Refresh; list failure is Reload. Chinese/English copy added.

Checks: targeted page/parser Jest 2 suites / 7 tests PASS; tsc, changed ESLint and diff check PASS. Replacement/share and reload controls on simulator/device remain NOT VERIFIED. PR remains OPEN.

## Family directory inline join — 2026-10-09

Removed visible Selected/current-family duplication; selected border and accessibility selected state remain. Each creator tile has its own Invite family action bound to that tile ID; member tiles have none. Join with an invitation expands a reusable inline panel: paste, preview, explicit confirm, result and fresh directory read. Clear input invalidates old preview qualification. Invalid links receive a lightweight message; no automatic acceptance. External /family-invite route remains for web/deep links and uses the same panel. Login continues through the existing account diagnostics route; returning rechecks account before confirmation.

Layout uses existing paper/cover wall/SettingsPage keyboard-aware scroll and 48pt actions, with section spacing and creator actions inside tile containers (no nested Pressables).

Checks: tsc PASS; changed ESLint PASS; targeted Jest 4 suites / 19 tests PASS (creator/member actions, no redundant selection text, inline preview/confirm and directory refresh without navigation, input clear/late preview, existing lock/background/login and invitation share tests); diff check PASS. Actual simulator/device layout, keyboard, scrolling, focus, Chinese/English and inline join flow NOT VERIFIED. Attachment unavailable in this workspace; implementation follows the written requirements, not a claimed screenshot comparison. No production/TestFlight changes; PR remains OPEN.

## User report and invitation authentication handoff — 2026-10-09

User reports two-simulator PASS for replacement/share confirmation cancellation, old-link invalidation, new-link join, no duplicate copied link, used/revoked statuses, inline preview/explicit join/result/list refresh/Done, and member tile without invitation action. Runtime SHA not independently confirmed. Not public HTTPS/QR/Universal Link or real-device acceptance.

Added invitation-scoped login handoff using existing Apple/controlled test account methods. Sign in to join routes to a gated reusable identity screen; success automatically returns to the existing stack page, cancel preserves pending invitation, failures remain on login. Only known /family or /family-invite fallback routes are accepted. Intent generation is passed (not bearer); changed intents invalidate old success navigation. Returning rechecks preview and current account before explicit confirmation; expiration during login blocks confirmation. No public registration, phone/SMS or automatic join introduced.

Checks: targeted Jest 5 suites / 44 tests PASS; tsc PASS; changed ESLint PASS; diff check PASS. New identity success/cancel/retry/expired flow remains simulator/device NOT VERIFIED. Full Jest not repeated for this handoff; previous full-suite evidence remains as recorded. Family entry/default production gates unchanged; PR remains OPEN.

## Compact invitation UI — 2026-10-09

Join panel: empty/whitespace input disables View invitation visibly and accessibly. Clear icon is inside input row (48pt); separate Clear/Collapse controls removed. Outer Join with an invitation toggle remains available.

Invitation page: date/status icon/color rows; actions hidden until a pending row opens; QR + Share + Revoke, no replacement button. Used/expired/revoked rows gray and never reveal destructive/share actions; full status retained for VoiceOver. Refresh icon at list top right. New invites are cached in account/family/invitation-scoped device-only Keychain; small chunks and last-published manifest, cache loss/partial data does not fabricate QR. Authorized server status governs display and ended-cache removal. Old or other-device invites remain unrecoverable and are explained.

Checks: changed tsc/ESLint/diff PASS; targeted Jest 4 suites / 22 tests PASS (empty-input/icon clear, create/cache/single-message share, restore on expansion, used no actions, cache account/family isolation/cleanup/partial data, old missing cache, reload). Native Keychain persistence, actual QR sharing, row styling and VoiceOver on simulator/device remain NOT VERIFIED. No API/schema/dependency change or production/TestFlight write; PR OPEN.
