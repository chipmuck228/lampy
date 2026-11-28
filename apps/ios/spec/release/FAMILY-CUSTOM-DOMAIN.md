# Family API custom-domain cutover

Baseline: main 5d39cdd. New public origin: https://lampy-api.5sparks.ai. Hosting target: lampy-family-staging.onrender.com. This PR changes client/build configuration only; it does not deploy a server, change DNS, migrate data or upload TestFlight.

## Client scope

Family/internal, TestFlight Sandbox, appstore-v1 and appstore-launch profiles now target the same self-owned domain. Their existing identity, purchase, export and diagnostic flags remain separate and unchanged. A custom domain does not itself enable production features. Personal-only builds still close family/purchases. Android preview keeps purchases, saved-edition export and PDF closed.

Both account and family API use the custom domain where enabled. The configured origin supplies invitation creation/parsing; iOS associated domains and archive inspectors require the new host. Old-domain and direct Render invitation links are intentionally not accepted by new configured clients. The lampy:///family-invite custom-scheme flow and explicit join confirmation remain intact. Android continues its existing browser-page-to-custom-scheme handoff; this PR does not introduce verified Android HTTPS App Links or an assetlinks.json route.

Historical acceptance documents, deploy-invite-web-test.sh (fixed to the old isolated Ubuntu service), and old-host diagnostic probes remain historical/old-environment tools. Do not use them to deploy or verify Render. The official Lampy marketing website and its domain are unchanged.

## Server prerequisites — separate operator work

1. Configure lampy-api.5sparks.ai as a Render custom domain, then set the CNAME target Render provides and wait for valid HTTPS.
2. Use persistent storage for both LAMPY_FAMILY_DATABASE_PATH and LAMPY_FAMILY_MEDIA_PATH; stop the old writer before restoring the final consistent SQLite/media backup. Preserve account IDs and purchase bindings. No concurrent old/new independent SQLite writers.
3. Run the accepted server code and enable the existing required features: Apple/email login, family history, family albums, unified purchases, family album export and invitations. Keep the existing product lampyepubexport and Sandbox purchase environment for this testing phase. Do not enable public/test-password login merely to make health flags true.
4. Set LAMPY_FAMILY_INVITES_ENABLED=1 and LAMPY_FAMILY_INVITE_ORIGIN=https://lampy-api.5sparks.ai. Keep existing Apple bundle/team identity, certificate and private-key configuration; update secret file paths for the new host. Configure SMTP for verification codes. No secrets belong in client public environment variables or the repository.
5. Map the Render listener host/port appropriately. Existing trusted-loopback-proxy options require 127.0.0.1 binding and a controlled proxy; do not copy Ubuntu/Caddy loopback settings into a directly exposed Render listener. Validate rate limiting/proxy behavior before enabling login.
6. Verify /health capability flags, /invite and /.well-known/apple-app-site-association over HTTPS without a redirect to the old host. AASA must include B283NY984J.app.lampy.ios; the existing route serves it when invitation configuration is enabled. App Store download URL remains unset until the app is publicly available.

## Device acceptance

From the PR branch's repository root on a Mac:

```bash
LAMPY_FAMILY_EPUB_PRODUCT_ID=lampyepubexport bash apps/ios/scripts/prepare-family-epub-device.sh sandbox
```

Use Release Run, StoreKit Configuration None, and install over existing Lampy without uninstalling or clearing records. Stored sessions may remain valid if their server records were migrated; otherwise sign out and sign in again. This PR does not rewrite secure-store sessions, migrate tokens or weaken account/family transport endpoint checks. Local personal records remain on the device. TestFlight 18's already prepared release branch remains old-host; use a new unused build number for a later uploaded new-host build.

Check two accounts/devices: login/verification codes, original family/membership, historical photos/audio/albums, new share propagation, free preview, account-bound paid EPUB export/restore, normal-member restrictions, new QR/link save/share, cold/warm app opening and explicit join, revoked/expired invite rejection, and managed-family deletion protection. Verify background/lock recovery and no stale old-host family content. Verify Android remains preview-only and its invite custom-scheme handoff works. Test fresh/redeploy/restart server persistence separately.

## Status

Operator-reported migration evidence (2026-11-28): SQLite integrity and file manifest checks passed; 33 media files restored; service running main 5d39cdd now uses /var/data/lampy-restored/family.sqlite and /var/data/lampy-restored/media. Private key and root certificate parsing passed. Health reports Apple/email login, family history/albums, unified purchases and family export enabled. The actual custom domain lampy-api.5sparks.ai has verified HTTPS; /invite returns 200; its AASA returns B283NY984J.app.lampy.ios for /invite. These are operator reports, not installed-app acceptance. Mail delivery, real Apple verification, iOS AASA/device behavior and full end-to-end device acceptance remain pending. CI/local configuration checks cannot establish these deployment facts. Full account deletion after transfer/dissolution and Android gallery acceptance remain deferred from prior work.

Prior candidate-domain verification at 5e89974: TypeScript, changed production TypeScript ESLint (zero warnings), shell syntax and diff checks passed; 25 Node profile/archive checks, 12 archive-privacy checks, 43 domain/invitation/transport checks, 82 account/family/endpoint checks and 226 Android preview checks passed. Existing account-screen tests emit React act warnings while passing. macOS native compilation, Android APK builds and actual custom-domain device acceptance are not claimed by these checks.

## Actual-domain correction and Mac install

The earlier lampy-family-api.5sparks.ai candidate was not the domain deployed by the operator. All active profiles now require lampy-api.5sparks.ai; the former candidate is a rejected destination in regression fixtures. The current execution environment is unavailable, so local checks were not rerun for this correction. GitHub Actions on the updated commit are the verification route; prior candidate-domain green CI must not be reported as updated-head evidence.

Run commands individually on the Mac, stopping on errors:

```bash
cd /Users/zhen/WeChatProjects/lampy-ui-e9daad5
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 fetch origin
git worktree add --detach /Users/zhen/WeChatProjects/lampy-pr152-device origin/feat/family-api-custom-domain
cd /Users/zhen/WeChatProjects/lampy-pr152-device
git log -1 --oneline
LAMPY_FAMILY_EPUB_PRODUCT_ID=lampyepubexport bash apps/ios/scripts/prepare-family-epub-device.sh sandbox
```

If that directory already exists, inspect its git status and ref before reuse; never force/reset it. Xcode: Lampy scheme, physical iPhone, Release Run, StoreKit Configuration None; keep the previous signing team and install over the app. No uninstall or data clearing. This is a local device build, not a TestFlight upload. The old Ubuntu test service must remain stopped.

Report acceptance separately: email code delivery/login and Apple login; original family/membership and all historical media; personal/family free full-screen previews; original purchased-account access restored without repeat payment, family grant if needed, EPUB saved/shared to Books; member preview-only restrictions; new-domain QR/links, cold/warm routing, explicit join, expiry/revocation; lock/background recovery; no PDF entry. Use a new valid invite since pre-migration invites can expire. Do not require another purchase to test an already-owned account. Confirm local personal records remain intact.
