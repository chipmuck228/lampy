# Family invitations — Phase C

Base: ordinary #93 merge `0ce804c95a6658f0f998182cc8b1b5faf4d1a3c2`.
Independent branch `ios/family-invite-links`. Production entry remains closed. No deployment or TestFlight upload. `identityLoopAccepted` is unchanged/false.

## What exists

A creator selects their family, opens **邀请家人 / Invite someone close**, creates a 7-day, one-successful-new-member invitation, and shares its QR/link with the system share sheet. The raw bearer is returned once and retained only on that page; leaving/backgrounding drops it. The creator can list status/expiry and revoke an unused invitation, but cannot retrieve the bearer again. A network-uncertain creation may exist: refresh, revoke if needed, then create anew. There is no creation replay storing plaintext tokens.

The receiver opens an external link/QR. `/invite` displays the family name, expiry, one-member constraint, installation/reopening instructions and a button to open Lampy. No family members, moments, photos, recordings, phone/email or account identifiers are public. A configured App Store URL is optional; no fake ID/download URL is supplied. Installation does **not** preserve the bearer: reopen/rescan the original invitation.

In a controlled enabled app, the receiver signs in if necessary, returns to the invitation, then explicitly chooses **确认加入 / Confirm and join**. Opening a link, login, viewing, cancellation or a failed/limited request never consumes the slot. Native-intent routing keeps the bearer out of route query parameters and persistent storage. The family directory offers inline Join with an invitation. The invitation-scoped login screen reuses Apple/controlled test login, automatically returns after success, preserves the intent on cancellation, and rechecks the account/invitation before explicit confirmation. External /family-invite landing remains supported. No built-in scanner or internal invitation inbox/push is introduced.

Acceptance is one SQLite `BEGIN IMMEDIATE` transaction: check active family, current membership, invite status/expiry, combined 10-family cap; insert membership and consume the token together. Current active members/retries across sessions return their existing membership without consuming another slot. Left/removed users cannot reuse an accepted token. A fresh invitation is required. Dissolution immediately blocks new acceptance. New endpoints do not change legacy share/audience behavior: historical sharing policy is Phase D, leave/transfer/cleanup Phase E, billing later.

## Storage/security

Migration **20** appends `family_invite_links`; 1–19 unchanged. Tokens: Node crypto 32 random bytes, 64 lowercase hex, database stores SHA-256 only. Legacy v1 invitation storage/routes remain separate and are not used by this UI; do not claim legacy invitations already follow v2 rules.

The token is a URL **fragment**, not a query/path. The external page posts the token to `/v2/invitations/preview`; never puts it into markup, analytics, logs or browser storage. Web responses: no-store, no-referrer, CSP/self-only script/style/connect, no framing. Server-only `qrcode@1.5.4` creates an ephemeral PNG data URL. No QR filesystem persistence or new native QR dependency.

Limits commit independently, including rejected attempts: preview 40/15min per socket peer; create 8/15min per account; accept 20/15min per account. Unknown sessions share a bounded bucket. `X-Forwarded-For` is intentionally not trusted. Before public hosting, configure/review a trusted reverse-proxy rate policy: the local proxy otherwise shares a socket-peer preview bucket. These are development safeguards, not a claim of public operational readiness.

## Endpoints

- POST /v2/families/:familyId/invitations — creator; token/link/QR returned once
- GET /v2/families/:familyId/invitations — creator; metadata, no bearer
- POST /v2/invitations/:id/revoke — creator
- POST /v2/invitations/preview — public, body `{ token }`, no membership mutation
- POST /v2/invitations/accept — authenticated, body `{ token }`, explicit action only
- GET /invite, /invite.js, /invite.css — configured invitation web
- GET /.well-known/apple-app-site-association — configured HTTPS origin only

All invitation JSON stays within the existing 4 KiB request bound. Share/media bounds unchanged.

## Isolated testing (Mac)

Use an isolated SQLite path/media directory and existing CLI-created controlled accounts. Never point migrations or accounts at the hosted production database. First migrate the isolated database, then create accounts via hidden TTY/protected file as documented in Phase B. Start the API from **apps/ios**, using that same database:

```sh
LAMPY_FAMILY_API_MODE=production \
LAMPY_APPLE_CLIENT_ID=app.lampy.ios \
LAMPY_FAMILY_DATABASE_PATH=/absolute/isolated/family.db \
LAMPY_FAMILY_MEDIA_PATH=/absolute/isolated/media \
LAMPY_TEST_ACCOUNT_LOGIN=1 \
LAMPY_FAMILY_INVITES_ENABLED=1 \
LAMPY_FAMILY_INVITE_ORIGIN=http://127.0.0.1:8787 \
npm run family-api
```

In another terminal, from apps/ios:

```sh
EXPO_PUBLIC_FAMILY_API_BASE_URL=http://127.0.0.1:8787 \
EXPO_PUBLIC_FAMILY_ENTRY_OPEN=1 \
EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS=1 \
npx expo start --dev-client --localhost --port 8087 --clear
```

Connect the simulator to **this** Metro, not another worktree. A creates/selects a family → invite → share/copy link; B expands Join with an invitation on the family page and pastes the link → preview → Sign in to join → automatic return → explicit confirm → refreshed family list (external /family-invite also supported). Opening the webpage or login alone must not add B. C must be rejected after B uses the only slot. A can revoke another invitation. Never copy real invite/session/password values into screenshots, WALK or PR.

For two physical devices use a safe reachable HTTPS or private-LAN API/origin (127.0.0.1 points to each device). Universal Links require an enabled controlled native prebuild/reinstall: the config plugin adds associated domains only when family entry is enabled and the API is root HTTPS. The configured HTTPS host must serve AASA, with correct Team+Bundle ID and platform provisioning capability. This has **not** been deployed or device-verified; the plugin does not enable it in production by itself. Do not claim a custom-scheme simulation proves Universal Links.

Keep public registration closed; account deletion remains its prerequisite. A web download button requires the confirmed `LAMPY_APP_STORE_URL=https://apps.apple.com/...`; do not invent one.
