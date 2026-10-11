# Controlled public test accounts (API only)

From main 76586caf59c81312d1108f6b3ff7d177f75e9b05. This PR is not a server deployment or a TestFlight release.

## Contract

`LAMPY_PUBLIC_TEST_LOGIN=1` enables only operator-provisioned email/password login at `/v2/auth/email/login`. Emails are account names, not verified mailboxes. No password recovery or mail delivery is promised. `/v2/auth/email/register`, `/v1/auth/test-account`, and Apple sign-in are closed in this mode. Apple remains unchanged outside this mode; real Apple login is a separate acceptance step.

Requires production SQLite mode, explicit loopback binding, explicit trusted local proxy, and both legacy account switches off. Session checks reuse the existing credential enabled bit across family/profile/media/share commands. Disable removes all sessions. Revoke-sessions removes sessions without disabling the account; the next explicit login can create a new session. Neither operation changes memberships, shares, or local personal records.

Migration 27 adds operator_provisioned (default false). New local CLI-created accounts are marked true. Existing accounts, including old self-registered accounts, are NOT automatically promoted; public login and existing-session guards reject them. Reuse schema 14–16 credentials/session/rate limits and schema 26 profile. Run migration before operator CLI. Operators create accounts through the existing local CLI, never through public HTTP. Users can set their nickname after login using the existing profile endpoint.

Limits: persistent per-peer 8 attempts/15 minutes and per normalized account 8 attempts/15 minutes; failures and successful attempts both count. Unknown, wrong-password, and disabled accounts receive the same AUTH_FAILED response and password verification/dummy work. Four admitted auth requests maximum per process, including body reading; excess gets 429. Body timeout is 10 seconds; request timeout 15 seconds. Slow/aborted requests release admission. This is a single-instance test service; no multi-instance scaling claim.

## Proxy boundary

For direct Internet → Caddy → loopback Node only. Caddy must OVERWRITE the dedicated header; client-supplied X-Forwarded-For is not used. Node rejects auth requests missing a single valid IP header, or not arriving from loopback. Local host administrators/processes remain trusted. Do not place an additional CDN/proxy in front without revisiting this policy.

```caddyfile
family-test.yunpura.com {
    reverse_proxy 127.0.0.1:8788 {
        header_up X-Lampy-Client-IP {remote_host}
    }
}
```

Configuration for AFTER review, backup, code update, and Caddy validation/reload:

```ini
LAMPY_FAMILY_API_MODE=production
LAMPY_FAMILY_API_HOST=127.0.0.1
LAMPY_FAMILY_API_PORT=8788
LAMPY_PUBLIC_TEST_LOGIN=1
LAMPY_PUBLIC_TEST_TRUST_LOOPBACK_PROXY=1
LAMPY_TEST_ACCOUNT_LOGIN=0
LAMPY_CONTROLLED_EMAIL_ACCOUNTS=0
```

Retain database/media/Apple audience/invite/history settings. Do not expose port 8788 externally or reuse the old 8787 database. Existing public deployment has both account gates closed; no changes have been made by this PR.

CLI from apps/ios, with LAMPY_FAMILY_DATABASE_PATH explicitly pointing to the isolated test DB:

```bash
npm run family-api:test-account -- create tester@example.com
npm run family-api:test-account -- revoke-sessions tester@example.com
npm run family-api:test-account -- disable tester@example.com
```

Create uses hidden interactive password (or existing restricted file/FD input), never command arguments. Run as the service account. No enable/reset-password operation is included. If an account is retired, use a new operator-created account rather than silently transferring identity.

## Capability / next slice

Health: controlledEmailAccounts=true (email login capability), emailRegistration=false, publicTestLogin=true, testAccountLogin=false. Existing App may still show the legacy create-account UI based on controlledEmailAccounts. This API-only PR does NOT authorize a TestFlight upload: a separate internal build/UI slice must consume emailRegistration, hide registration and provide normal controlled login, while preserving ordinary Release gates.

#103 remains independent and its preflight currently rejects legacy email/test account gates. Do not describe its config-only output as public readiness or bypass its checks to bless this new mode.

## Deployment facts reported by user

Ubuntu 24.04.4, Node 22.20.0; transferred main 76586ca archive (SHA256 3426aeb3d34dd384a09dfb75a7ae45e731cc4c5e4fcc2b1fffd6887e5b361176). Isolated /srv/lampy-family-test backed by /dev/vdb[/lampy/family-test]; API 127.0.0.1:8788; Mac HTTPS health returned 200 on 2026-10-11. This is baseline deployment evidence, NOT evidence of this PR's auth implementation. Old 8787 preserved.

npm ci reported 68 vulnerabilities across installed App/dev dependency inventory. No npm audit fix was run. API runtime dependency exposure still needs audit before inviting testers; this PR does not certify the dependency inventory safe.

## Acceptance still needed

Actual Caddy overwrite (including a forged incoming header), two real client IPs, persistent rate limiting across service restart, create/login/revoke/disable on isolated server, App expired-session behavior, invitation return without auto-join, protection overlays, log privacy. No simulator/real device/public auth PASS in this PR. No TestFlight, paid features, generic registration, account deletion, or real Apple login acceptance.
