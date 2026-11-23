# iOS launch — stage 1

Scope: prepare a production candidate configuration, close the Apple-linked deletion gap, and align in-app help, terms and privacy disclosures. This stage does not deploy a server, upload an archive, merge the PR, redesign pages, or change PDF/EPUB rendering. No dependency upgrade or database migration is required.

## Candidate configuration

`appstore-launch` is separate from the existing `appstore-v1` and `family-internal` configurations. Existing commands retain their scope. A merged implementation does not by itself enable a build flag or server feature.

| Item | Candidate setting |
| --- | --- |
| API and account API | `https://family.yunpura.com` |
| Apple login, email code login, family entry and album preview | Enabled |
| Personal paid EPUB/PDF export and unified purchases | Enabled |
| Family finished-file export, print evaluation, test login UI and diagnostics | Disabled |
| App Store product ID | Required input; no default production SKU |
| Build number | Required positive integer; choose a new App Store Connect build number |
| Dotenv loading | Disabled; explicit public configuration persisted into the Xcode shell |

This profile does not create a product or establish that the server supports purchases. The real non-consumable product must exist under this app in App Store Connect, match the server's `LAMPY_UNIFIED_PRODUCT_ID`, and be available for the intended environment. Test, example and placeholder product identifiers are rejected. Syntactic validation cannot prove that a product exists.

From this checkout's `apps/ios` directory on macOS:

```bash
npm ci
printf 'New App Store build number: '
read -r LAMPY_BUILD_NUMBER
printf 'Configured App Store product ID: '
read -r LAMPY_RELEASE_PRODUCT_ID
export LAMPY_BUILD_NUMBER LAMPY_RELEASE_PRODUCT_ID
bash scripts/release-archive.sh --appstore-launch --prepare
```

`--prepare` generates the native workspace without archiving or uploading. Open `ios/Lampy.xcworkspace` in Xcode for a device build. An Apple authorization flow requires a device with Sign in with Apple available. A local StoreKit configuration remains a local test, not a real server-verified Sandbox purchase.

To make a local Release archive, run the same command without `--prepare`. It does not upload to App Store Connect:

```bash
bash scripts/release-archive.sh --appstore-launch
```

Use the explicit profile when inspecting an existing candidate archive; the generic `--inspect` retains its old expectations:

```bash
bash scripts/release-archive.sh --appstore-launch --inspect /tmp/lampy-testflight-beta-1/Lampy.xcarchive
python3 scripts/inspect-archive-privacy.py \
  --archive /tmp/lampy-testflight-beta-1/Lampy.xcarchive \
  --expected-build "$LAMPY_BUILD_NUMBER" \
  --profile appstore-launch \
  --product-id "$LAMPY_RELEASE_PRODUCT_ID" \
  --output /tmp/lampy-launch-privacy
```

Static inspection does not verify runtime permissions, SDK disclosure accuracy, real purchases, Apple token revocation, or App Store acceptance. The final archive must be rechecked after stages 2 and 3.

## Account deletion

- Email status adds the backward-compatible optional `appleLinked` field.
- Email-only accounts keep the existing code-confirmed deletion flow.
- Apple-linked accounts use a fresh nonce-bound Apple authorization from the email account page. The existing deletion endpoint verifies the subject and attempts token exchange/revocation before reporting the result. Cancellation, an unavailable native provider, leaving the screen, changing account, device lock, or backgrounding before confirmation prevents submitting deletion.
- A brief iOS `inactive` state for the native Apple sheet is allowed; actual backgrounding invalidates the attempt. An authorization result never clears another signed-in identity.
- The server refuses email-only deletion of an Apple-linked account both before sending a code and when consuming a previously sent code. This closes old-client and link-during-deletion bypasses. Old clients receiving `APPLE_DELETION_AUTH_REQUIRED` need an app update or the existing Apple account page.
- Successful deletion retains local personal records and albums, clears account UI state, and returns to Settings. An Apple revocation failure uses the existing explicit manual-revocation notice; it is not reported as successfully revoked.
- Server first, then app is the recommended deployment order. No migration is added. Keep the prior server artifact and backup for normal rollback; this PR itself performs no deployment.

Production Apple revocation needs `LAMPY_APPLE_CLIENT_ID`, `LAMPY_APPLE_SIGNIN_KEY_FILE`, `LAMPY_APPLE_SIGNIN_KEY_ID`, and `LAMPY_APPLE_SIGNIN_TEAM_ID`. These private values stay on the server, never in `EXPO_PUBLIC_*`, the repository or screenshots. The test endpoint's successful email delivery does not establish that the production endpoint is configured.

## Disclosures

Launch builds have separate Chinese and English help, terms and privacy text, dated 2026-11-23. It covers email verification and Resend delivery, Apple/email account linking, immutable first-email nickname, account deletion, StoreKit transactions, personal exports and local data retention. Existing family reporting, blocking, rate-limit and operational-backup disclosures are retained.

The launch privacy manifest adds linked Email Address and Purchase History, used for App Functionality without tracking. Existing collection categories and permission descriptions remain. No new native permission is introduced.

Before release, publish equivalent changes to the public privacy policy and complete the App Store Connect privacy questionnaire against the final deployment. This PR changes in-app text and configuration only; it does not publish the website or submit questionnaire answers.

| Data | Processing and disclosure |
| --- | --- |
| Linked email | Account login/recovery; Resend delivery of recipient address and code |
| Verification codes | Five-minute challenge; keyed digest persisted, readable code sent only for delivery |
| Apple identifier | Account identity; fresh authorization used for deletion verification/revocation |
| Product and signed transaction identifiers | Verification and restoration of paid eligibility; no bank card details received by Lampy |
| Unshared personal records and personal export files | Generated/stored locally; files saved to another app cannot be remotely recalled |
| Family content, relationships, reports and abuse limits | Existing family-service scope and cleanup/backup limitations remain disclosed |

## Device acceptance before stage 4

1. Email-only deletion: code, successful return to Settings, no stale nickname/countdown; local records remain.
2. Link an email to an Apple account, sign out, sign back in with that email. Deletion must open Apple authorization, not request an email code.
3. Cancel Apple authorization: account stays. Complete with the correct Apple account: deletion succeeds, sessions expire and local records remain. Check the revocation result and server-side authorization using real configured keys.
4. Wrong Apple account, background, device lock, navigation away and account change: do not delete or clear a different account.
5. Chinese and English Help/Privacy/Terms describe enabled email and exports; no claim that all purchases/exports are closed. The old `appstore-v1` build retains its old scope.
6. The candidate has no internal test-login controls or diagnostics; product and native/JS flags agree. Verify independent Release operation after shutting down Metro.

## Remaining release inputs and later stages

- Real App Store SKU, production Apple revocation credentials and purchase-verification configuration must be supplied/verified by the operator. Never paste private keys into chat.
- Real Sandbox purchase/restore/refund/account association, production deployment and email delivery are stage 4 work, not proven by unit tests or local StoreKit.
- UI simplification is stage 2; export design is stage 3; final archive/privacy/store review is stage 5.

Privacy type references: [Apple data categories](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype) and [App privacy details](https://developer.apple.com/app-store/app-privacy-details/).
