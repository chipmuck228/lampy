# Lampy 1.0.0 — first-party data disclosure mapping

2026-10-24; schema 33. Scope: production appstore-v1, Apple sign-in and family features enabled; purchases, all exports, controlled-password/test login and diagnostics closed. This is the source-of-truth submission worksheet, not evidence that App Store Connect or the public website has been updated. The developer confirmed family relationships are solely for family functionality; IP solely prevents login abuse, without geolocation, advertising analytics, cross-service tracking or disclosure for those purposes. Cloud hosting processes server data on Lampy's behalf; this does not mean data never reaches a hosting provider.

## Mapping and App Privacy answers

Collect data: **Yes**. For every declared row: purpose **App Functionality**, linked to user **Yes**, tracking **No**. Optional family features still count as collection. No anonymity claim is made for raw IP. Category choices below are developer assessments using Apple's definitions, not an Apple approval. IP is Other Data Types because it is retained for security, not location inference, device identification or technical measurement. Contacts covers the social graph, not an OS address-book upload.

| App Privacy category / manifest token | Fields and collection trigger | Source evidence | Retention boundary |
| --- | --- | --- | --- |
| User ID — `NSPrivacyCollectedDataTypeUserID` | Apple subject, internal user ID, nickname, account/session association during login/profile use | infrastructure/expo-apple-auth.ts requestedScopes []; family-api/apple-auth-commands.ts; sqlite-repository.ts; schema.ts | Account lifecycle; sessions retained until revoked/deleted; no claim that every expired row is periodically purged |
| Contacts — `NSPrivacyCollectedDataTypeContacts` | Family membership, roles, invitations/acceptance, creator transfer and blocks | schema.ts; commands.ts; safety-commands.ts; safety-types.ts | Family/account lifecycle; leaving a family is not deletion; directory history may remain |
| Other User Content — `NSPrivacyCollectedDataTypeOtherUserContent` | Explicit shared note, feeling, dates, source IDs, selected audience; family/album names, opening and order | types.ts ShareSnapshot/ShareRecord; share-commands.ts; family-album-types.ts; family-album-commands.ts | Withdrawal/access controls, account deletion, dissolved-family cleanup; no blanket immediate physical-erasure promise |
| Photos or Videos — `NSPrivacyCollectedDataTypePhotosorVideos` | Selected family photo copies and media identifiers/hash/type/size | media-commands.ts; media-blobs.ts; native photo preparation; strict server validation | File cleanup/retry queues; local original unchanged; historical metadata inventory remains separate |
| Audio Data — `NSPrivacyCollectedDataTypeAudioData` | Selected family sound copies and media metadata | same media pipeline and ShareSnapshot | Same file/lifecycle boundary |
| Customer Support — `NSPrivacyCollectedDataTypeCustomerSupport` | Report reason/detail, reporter/author/share/family references, status; moderation reasons/audit and restrictions | safety-types.ts; safety-commands.ts; safety repository and admin operations | Relevant account/family purge paths; schema 33 has no universal age-based expiry for reports/audit |
| Other Data Types — `NSPrivacyCollectedDataTypeOtherDataTypes` | Login source IP in apple-challenge bucket, window time/count; security challenge/session state | apple-auth-commands.ts; public-test-auth.ts; listen.ts; schema.ts | One-minute window is NOT retention; old rate rows have no global expiry in schema 33; challenge expiry is enforced, pruning occurs on auth operations |

All file paths above are relative to apps/ios/src. Production formal Apple sign-in neither requests name/email nor saves token email; schema nullable email and legacy test paths are not evidence of production collection. Nonempty production email rows require investigation before final answers. Nickname is a screen name, not a required legal name. Family timeline records are generic user content, not a private chat/email feature. Generic feelings are not a clinical health feature. No location or address-book permission is used; retained historical GPS-bearing files must still be resolved before a blanket no-location claim. If actual historical metadata remains accessible, final location disclosure needs reassessment or cleanup evidence.

Private unshared moments, personal albums, on-device playback/read state and biometric authentication stay on device and are not declared as server collection. OS/Apple services may handle their own data. Purchases/payment information are not collected by the disabled release purchase flow; nonzero legacy production purchase rows must be examined. No source evidence of advertising/analytics tracking integration was found; final SDK/Archive verification remains required. Do not select analytics, advertising, personalization or device ID merely because security and social relationships exist. Do not rely on optional-support exemption for reports.

## Read-only production verification

Upload scripts/family-data-disclosure-probe.cjs to the server, install root-owned group-readable beside the API scripts, then run as the existing service user using the production EnvironmentFile. It uses only node:sqlite and fs; no npm installation, migration, HTTP call or data mutation. Opens the existing DB read-only, query_only, one read transaction; only hardcoded aggregate queries. Requires schema exactly 33; later schema must be reviewed. Does not print IP, account IDs, family IDs, tokens, report details, filenames or row timestamps. It does not establish deletion guarantees from an empty table.

```sh
sudo install -o root -g lampy-family -m 0640 \
  /home/ubuntu/family-data-disclosure-probe.cjs \
  /opt/lampy-family/apps/ios/scripts/family-data-disclosure-probe.cjs
sudo systemd-run \
  --unit="lampy-disclosure-probe-$(date +%s)" \
  --wait --pipe --collect \
  --property=User=lampy-family \
  --property=Group=lampy-family \
  --property=EnvironmentFile=/etc/lampy/family.env \
  --property=NoNewPrivileges=true \
  --property=ProtectSystem=strict \
  --property=ProtectHome=true \
  /usr/local/bin/node \
  /opt/lampy-family/apps/ios/scripts/family-data-disclosure-probe.cjs
```

Return only the JSON summary. Nonzero olderThan24h confirms live retention, not a defect in the one-minute rate algorithm. Nonzero email/purchase rows require provenance review. Schema mismatch exits generically without dumping SQLite errors. Production flags, photo metadata, cloud snapshots, website deployment and ASC answers are NOT inspected by this probe.

## Policy synchronization

The in-app production policy now explains family/social graph, raw IP security storage, no tracking purposes and the current absence of global rate/report age expiry, plus separation of online deletion and operational copies. Bilingual source: screens/settings-v1-copy.ts and i18n/en.json. No new retention implementation or schema migration is included; PR131 remains paused.

For website privacy policy, use the matching Chinese/English text in V1-PRIVACY-POLICY-ADDENDUM.md as an addendum to the existing complete policy. It does not replace controller/contact/rights/hosting information. Review and deploy in lampyweb separately; this PR does not publish that repo. Do not promise all cloud snapshots/logs vanish at seven days: app-managed backups, system logs and provider snapshots have independent configurations; old manual snapshots require inventory.

## Evidence and outstanding acceptance

Build14 (ee19b21) static Archive inspection had no flagged issues, but its app collected-data array was empty; Xcode PDF was one blank page and cannot substantiate disclosure. This change adds seven first-party categories through Expo ios.privacyManifests; it leaves required-reason API aggregation to the existing native dependency/prebuild pipeline. Do not patch signed Archive. After read-only production results and historical-photo disposition, rebuild a new unused build number, rerun inspect-archive-privacy.py, and export the Xcode report. Check that all seven entries survive prebuild; SDK required reasons still present; no purchase/export/test entry exposed; permissions and bilingual policy remain readable. Final report remains **PENDING_PRODUCTION_AND_REBUILT_ARCHIVE**, not release approved.

Official references (reviewed 2026-10-24):
- https://developer.apple.com/app-store/app-privacy-details/ (social graph, generic text, stored IP by use, linked-data and App Functionality definitions)
- https://developer.apple.com/documentation/technotes/tn3184-adding-data-collection-details-to-your-privacy-manifest
