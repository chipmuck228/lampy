# Family membership E1

Base: main `38307a8e5391f2e2aa61ecba13a84eb7c0443f3a` (#96).

## Scope

Selected family card → 家庭成员 → read-only roster. A member can explicitly leave; a creator can explicitly remove another member. Both use destructive confirmation. Confirmation explains that existing shares remain, personal records are unchanged, and rejoining requires a fresh invitation. Creator leave/self-removal is unavailable.

No transfer, dissolution/30-day cleanup, former-member share-management, account deletion, public registration, payment or deployment. Family remains closed by default; identityLoopAccepted is unchanged.

## Membership and requests

- GET `/v2/families/:familyId/members` returns active membership IDs, roles and joining dates only to a current member.
- POST `/v2/families/:familyId/leave` requires the caller's exact `membershipId`.
- POST `/v2/families/:familyId/members/:userId/remove` requires the target's exact `membershipId`; the caller must be the active creator.
- Server transactions recheck active family, actor role and membership ID. Retries for the same departed membership are harmless. If the member has rejoined, an old request returns CONFLICT instead of removing the new membership.
- Legacy single-family APIs remain for compatibility and are not used by the new UI.
- The application binds each roster to the account/session that read it. Focus, background, lock and card replacement invalidate UI confirmation. Submit ownership prevents duplicate writes and stale completion from releasing a newer lock.

## Cache and privacy

The shared history cache queue orders received-file work and cleanup. Successful local leave raises this family's generation, rejects late history reads and isolates only the old account/family. A successful directory read also reconciles cached families, including persistent SQLite rows after restart. Network failures do not imply zero families and do not trigger this reconciliation.

Denied reads/policy/roster/play authorization clear the corresponding entire family cache when membership is lost; share-only revocation remains share-scoped. Personal Moment/Asset repositories and other family caches are untouched.

This does not add push/poll notifications. The server denies subsequent reads immediately; another device updates its on-screen state/cache on directory refresh, page reentry or a fresh read/play authorization. Already downloaded/seen content cannot be remotely erased from a person's memory or external copies. Do not describe E1 as real-time cross-device screen removal.

## Presentation

Only the selected card shows the member entry. Existing warm-paper typography, bilingual copy, fixed application text sizes, safe-area layout and 48pt controls are reused. Membership UI stays within the card; no new mandatory page.

The current identity API has no verified display names. The UI shows “you”, creator/member position and joining date; it never displays internal user IDs, test-login names, email or phone, and never invents nicknames. Clear human identification/naming remains a product prerequisite before opening member management to public users. Joining dates are calendar labels, not proof of identity.

No migrations, new native dependencies or native rebuild are required for E1 itself. Use the existing D2 development build and this branch's Metro; preserve test-device records.
