# Phase D1 — versioned family snapshots and history authorization

Independent from latest main a016f64 (#94). Server/API implementation only; D2 UI, source reread after upload, account/family request generations, received cache isolation and playback are not implemented here. Production family entry and public registration remain closed; identityLoopAccepted stays false. No deployment, production database/env/DNS, TestFlight or device changes.

## Policy and migration

Append migration 21 only: family `history_policy` (legacy / family-history-v2), `history_confirmed_at`, `history_confirmed_by`. Existing families default legacy; SQL migration never broadens rights, edits snapshots/audience/idempotency or changes migrations 1–20. Transaction rollback and reapplication tested with real SQLite.

`LAMPY_FAMILY_HISTORY_ENABLED=1` explicitly enables controlled v2 APIs and v2 policy on newly created named (v2) families. Legacy v1 family creation remains legacy. Existing families require a currently authorized creator to submit the exact history confirmation. Migration records who/when and revokes all still-pending legacy and hashed invitations in the same transaction; create new invitations afterward. Repeated confirmation keeps the original audit time and does not revoke newly created invites. The switch is one-way in this slice.

Each list/detail/media/bytes/write/revoke request checks active session, current family and membership plus the matching policy. V1 share routes only serve legacy; v2 only serve confirmed/new v2 families. Mismatch is 409 FAMILY_POLICY_UPGRADE_REQUIRED, not silent widening. V2 gate disabled is 503 FAMILY_HISTORY_CLOSED. Existing historical snapshots retain frozen audience for audit, but v2 authorization uses current active membership, not audience or joinedAt. Removal/leave/dissolution/revocation/session invalidation deny reads on the next service request. No promise to erase screenshots or externally saved bytes.

## HTTP

All listed endpoints require Bearer session and explicit familyId. Media upload remains the existing authenticated `POST /v1/media` (8 MiB, owner-only raw access); shared media reads must use the share path.

| Method | Path | Contract |
| --- | --- | --- |
| GET | /v2/families/:familyId/history-policy | policy, current member only |
| POST | /v2/families/:familyId/history-policy | `{confirmation:"new-members-can-read-active-history"}`, creator only |
| POST | /v2/families/:familyId/shares | immutable selected snapshot; Idempotency-Key header |
| GET | /v2/families/:familyId/shares | active visible snapshots |
| GET | /v2/families/:familyId/shares/:shareId | exact share snapshot |
| GET | /v2/families/:familyId/shares/:shareId/media/:objectId | selected media metadata |
| GET | /v2/families/:familyId/shares/:shareId/media/:objectId/content | authenticated selected bytes |
| POST | /v2/families/:familyId/shares/:shareId/revoke | existing active-author revoke command, not Phase E former-member management |

V2 share input whitelist: sourceMomentId, sourceRevision, note, emotion, occurredAt (optional), occurredAtPrecision, ordered mediaObjectIds, expectedMediaCount, audienceConfirmation. `audienceConfirmation` must equal `new-members-can-read-active-history`; UI must actually show and obtain confirmation that later members can see active history (D2). Server confirmation is a protocol value, not proof of a real user's gesture. Unknown fields/context/people/device paths rejected. Unknown time remains unknown; known precision requires a valid date. IDs cannot be paths. At most 3 images + 1 sound. All selected objects must be owned and readable with matching bytes/hash; missing media fails the whole save instead of dropping it.

Family ID, source ID/revision and selected fields are bound into v2 SHA-256 request fingerprint. Separate idempotency namespace from v1; same revision/same target retries remain one share, changed fields or reused key with a different family fail. New revisions preserve existing snapshots. Server cannot see local personal originals; D2 must freeze the source and recheck revision/media availability after upload before submitting. Upload success alone is not share success; stored share is not a delivery receipt.

Share JSON cap remains 64 KiB for v1/v2 only; login/other JSON remains 4 KiB. Existing media limits unchanged. `/health.familyHistoryV2` reports the feature flag only, not authorization or an identity-loop PASS.

## Controlled testing and rollback

Do not run production migration. Test against isolated temporary SQLite and media directory; `npm run family-api:migrate` appends 21. Enable history only on the isolated service. D1 has no new App control; existing App is still v1 and cannot read/share an enabled v2 family until D2 lands. Use automated API tests or controlled HTTP calls, never interpret empty old UI as an empty family.

Rollback: remove LAMPY_FAMILY_HISTORY_ENABLED and restart. V2 routes close; v1 continues to refuse v2 families. Keep migration/policy columns and data; do not relabel v2 as legacy or drop policy columns as a rollback, which would silently alter rights. Any reverse data migration needs separate review.

Unreferenced uploaded media continues to use the existing storage behavior. TTL/cleanup jobs are not newly implemented here; require Phase E/deployment review before public use. No public hosting/AASA/rate-proxy rollout included.
