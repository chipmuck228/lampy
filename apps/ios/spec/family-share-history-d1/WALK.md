# D1 verification

## Actual environment

Linux Node/Jest with real temporary SQLite, two connections, memory blob fixtures, localhost HTTP listener. No simulator/native build or physical device. Baseline main a016f64. No personal or production database read/writes.

## Automated coverage

- Migration 20 → 21 preserves existing snapshot/audience rows and legacy policy; reapplies and reopens; failure rolls back column additions and version marker.
- Legacy joiners cannot read historical shares before creator confirmation; member cannot confirm; pending old/hash invitations revoked atomically; failed transaction changes neither policy nor invite; repeated confirmation preserves audit.
- V2 later joiner reads historical text/photo/sound via share-specific paths; owner media URL does not grant access; stranger, removed member, revoked share, dissolved family and signed-out session denied; fresh invite rejoin restores current-member history rights.
- Selected media owned/readable/complete; explicit audience confirmation; immutable source revision; duplicate and two-connection saves produce one share; cross-family/key conflicts and source device paths rejected.
- V2 HTTP whitelist/malformed media rejects, legacy route refuses v2 family, feature gate closes v2.
- Local HTTP long text + three JPEGs accepted in v1/v2; over 64 KiB rejected. Existing login 4 KiB checks retained.

Targeted Jest: 7 suites / 50 tests PASS. tsc PASS. Changed ESLint 0 errors; --no-ignore listen.ts retains existing qrcode require warning. git diff --check PASS.

## Not device/public acceptance

D2 App share/reading, selected source reread, cache isolation, active/offline UI, playback, Face ID paths, two simulators/physical devices, public HTTPS: NOT VERIFIED. No identityLoopAccepted change. PR to remain OPEN; no automatic merge.

Full Jest: 203 suites / 1088 tests PASS, 2 suites / 2 tests FAIL (205 / 1090 total). Isolated main a016f64 with the same dependencies reproduces the same life-page navigation-label and life-album-detail-sheet accessible-label failures (2 failed / 8 passed), so no new failures. Not a full-suite PASS.
