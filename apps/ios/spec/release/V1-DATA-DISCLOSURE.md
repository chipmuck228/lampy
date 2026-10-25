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


## 2026-10-25 production aggregate verification

The developer returned FIRST_PARTY_DISCLOSURE / READ_ONLY, schema 33: accounts 2, nonempty email rows 0; memberships 5, blocks 1, invitations 2; shares 26, media objects 29, albums 2; reports 4, moderation audit 3, restriction audit 3; Apple rate buckets 1, older than 24 hours 1, invalid time 0; purchase rows 0. Private values were not printed. These are point-in-time aggregate counts, not category completeness or deletion proof. They support the mapped account/social graph/content/support/security categories and the closed purchase scope; absence of email rows is consistent with the formal Apple flow. The old rate row confirms persistence beyond the rate window.

Retention deletion remains NOT_VERIFIED; production flags and historical photo metadata remain NOT_INSPECTED. The next dependency is a fresh full photo audit. A needsPreparation result only proves disallowed metadata/container structure, not GPS presence. Do not rewrite/delete indexed bytes in place or infer physical erasure. If any historical metadata-bearing copies remain, perform targeted inspection and an explicitly scoped disposition before final no-location disclosure.

Archive inspection now requires exactly the seven first-party categories in the app root manifest, linked=true, tracking=false, App Functionality only. Empty build14 declarations will now correctly block this strengthened check. SDK required-reason arrays remain independently inspected. Eleven synthetic Archive tests pass; these do not substitute for the next actual Mac Archive.


## Historical photo detail probe

The latest full read-only audit returned indexedPhotos=29, clean=26, needsPreparation=3; missing/integrityMismatch/unsafePaths/unindexed/partials/concurrentChange were all zero. GPS remains unknown from that audit. scripts/family-photo-metadata-detail.cjs reuses the deployed photo-metadata.ts container policy to select current needsPreparation candidates, verifies their stored hashes and sizes, and feeds bytes over stdin to /usr/bin/exiftool (Ubuntu libimage-exiftool-perl package). No source path is passed to ExifTool, no shell or write options are used, default ExifTool configuration is disabled. Raw metadata values are parsed only in memory; output is sample numbering, format and presence indicators for EXIF/XMP/IPTC/ICC/recognized PNG text and GPS/location tags. Parser warnings fail the probe rather than falsely report GPS absence. No full metadata JSON is printed or persisted.

This is a recognized-tag inspection, not proof against arbitrary embedded/steganographic content. NOT_DETECTED does not mean every possible location representation is absent, and color profiles are not GPS. It scans online indexed candidates only, not backup copies or snapshots. Existing files are never rewritten. Install the script beside the currently running API scripts so it uses the deployed policy and TypeScript dependency. Run under the same read-only systemd restrictions as the full audit. Two classification tests verify GPS/XMP recognition, private-value suppression and warnings failing closed; actual production ExifTool execution remains pending.


## 2026-10-25 historical detail result and disposition scope

Developer-provided read-only production result: schema 33, ExifTool 12.76, indexed photos 29 / clean 26 / candidates 3. Candidate 1 JPEG has EXIF and ICC; candidate 2 PNG has EXIF and XMP; candidate 3 JPEG has EXIF and IPTC. All three returned GPS/location tags NOT_DETECTED within recognized-tag coverage. No private values were printed; no rewrite occurred; backups and physical erasure were not inspected. These are not proof of metadata-free files or absence of every possible location encoding.

The developer confirmed all three are disposable test shares which may be withdrawn and, if needed, shared again from the current client. IMPORTANT source correction: share-commands.ts revokeShare only sets status=revoked/revokedAt; it does not retire media rows or delete files. family-cleanup.ts processes due dissolved families, not all revoked shares. Withdrawal alone therefore must not be reported as successful server file deletion. This finding corrects the earlier suggested assumption that withdrawal followed by ordinary hourly cleanup would necessarily yield needsPreparation=0.

Next dependency: developer withdraws every test share using these copies through the App, preserving private records and system originals. The detail probe now reports aggregate active/revoked references per candidate across families (without IDs/names). Active references block any later purge; moderation/blocking alone does not make a share safe to delete. Do not re-share yet or overwrite stored bytes. After withdrawal evidence, implement narrowly scoped maintenance for these authorized retired test copies, checking all references, receipts and durable file removal; no general retention/schema change or account/family deletion is authorized by this scope. No cleanup has executed. Re-audit online files after maintenance; backups/snapshots retain their independent lifecycle. Final Archive remains pending this sequence.
